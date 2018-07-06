import * as pulumi from "@pulumi/pulumi";
import * as dynamic from "@pulumi/pulumi/dynamic";
import * as serverless from "@pulumi/aws-serverless";

import * as GitHubApi from "@octokit/rest";
import * as ghEvents from "github-webhook-event-types";

import { GitHubWebhookResource } from "./github";

const ghToken = new pulumi.Config("github").require("token");

const hook = new serverless.apigateway.API("hook", { 
    routes: [
        {
            path: "/",
            method: "POST",
            handler: async (req, ctx) => {
                const eventType = req.headers['X-GitHub-Event'];
                const eventId = req.headers['X-GitHub-Delivery'];
                const body: ghEvents.PullRequest = JSON.parse(req.isBase64Encoded ? Buffer.from(req.body, 'base64').toString() : req.body);

                console.log(`[${eventId}] processing event: ${eventType} body: ${body.action}`);

                if (shouldDeleteBranch(eventId, body)) {
                    const ownerName = body.pull_request.head.user.login;
                    const ownerRepo = body.pull_request.head.repo.name;
                    const refName = body.pull_request.head.ref;

                    console.log(`[${eventId}] deleting ${ownerName}:${ownerRepo}@${refName}`);

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

                return {
                    statusCode: 200,
                    body: ""
                }
            }
        }
    ]
});

new GitHubWebhookResource("githubHook", {
    url: hook.url,
    owner: "ellismg",
    repo: "testing"
});

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

export const url = hook.url;