import * as pulumi from "@pulumi/pulumi";
import * as dynamic from "@pulumi/pulumi/dynamic";
import * as serverless from "@pulumi/aws-serverless";

import * as GitHubApi from "@octokit/rest";
import * as ghEvents from "github-webhook-event-types";

import { GitHubWebhook } from "./github";

const ghToken = new pulumi.Config("github").require("token");

const hook = new GitHubWebhook("hook", {
    repositories: [{owner: "ellismg", name: "testing"}],
    handler: async(e) => {
        const prEvent = <ghEvents.PullRequest>e.data;

        console.log(`[${e.id}] processing event}`);

        if (shouldDeleteBranch(e.id, prEvent)) {
            const ownerName = prEvent.pull_request.head.user.login;
            const ownerRepo = prEvent.pull_request.head.repo.name;
            const refName = prEvent.pull_request.head.ref;

            console.log(`[${e.id}] deleting ${ownerName}:${ownerRepo}@${refName}`);

            const octokit : GitHubApi = require('@octokit/rest')()
            octokit.authenticate({
                type: 'token',
                token: ghToken
            });

            await octokit.gitdata.deleteReference({
                owner: ownerName, 
                repo: ownerRepo, 
                ref: `heads/${refName}`
            });
        }
    }
})

function shouldDeleteBranch(eventId: string, payload: ghEvents.PullRequest) {
    if (payload.action != "closed") {
        console.log(`[${eventId}] ignoring event, action is '${payload.action}' not 'closed'`);
        return false;
    }

    if (!payload.pull_request.merged) {
        console.log(`[${eventId}] ignoring event, pull request was not merged`);
        return false;
    }

    const baseOwner = payload.pull_request.base.user.login;
    const headOwner = payload.pull_request.head.user.login;

    if (baseOwner != headOwner) {
        console.log(`[${eventId}] ignoring event, pull request is not from a topic branch, head owner is ${headOwner} not ${baseOwner}`);
        return false;
    }

    const baseRepo = payload.pull_request.base.repo.name;
    const headRepo = payload.pull_request.head.repo.name;

    if (baseRepo != headRepo) {
        console.log(`[${eventId}] ignoring event, pull request is not from same repo, head repo is ${headRepo} not ${baseRepo}`);
        return false;
    }

    const sourceBranch = payload.pull_request.head.ref;

    if (sourceBranch == "master" || sourceBranch == "staging" || sourceBranch == "production" || sourceBranch.startsWith("release/")) {
        console.log(`[${eventId}] ignoring event, source branch is ${sourceBranch}}`);
        return false;        
    }

    return true;
}
