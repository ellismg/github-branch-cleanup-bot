// Copyright 2018, Pulumi Corporation.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import * as pulumi from "@pulumi/pulumi";

import * as GitHubApi from "@octokit/rest";
import * as ghEvents from "github-webhook-event-types";

import { GitHubWebhook } from "./github";

const ghToken = new pulumi.Config("github").require("token");

function shouldDeleteBranch(eventId: string, payload: ghEvents.PullRequest) {
    if (payload.action !== "closed") {
        console.log(`[${eventId}] ignoring event, action is '${payload.action}' not 'closed'`);
        return false;
    }

    if (!payload.pull_request.merged) {
        console.log(`[${eventId}] ignoring event, pull request was not merged`);
        return false;
    }

    const baseOwner = payload.pull_request.base.user.login;
    const headOwner = payload.pull_request.head.user.login;

    if (baseOwner !== headOwner) {
        console.log(`[${eventId}] ignoring event, pull request is not from a topic branch, ` +
            `head owner is ${headOwner} not ${baseOwner}`);
        return false;
    }

    const baseRepo = payload.pull_request.base.repo.name;
    const headRepo = payload.pull_request.head.repo.name;

    if (baseRepo !== headRepo) {
        console.log(`[${eventId}] ignoring event, pull request is not from same repo, ` +
            `head repo is ${headRepo} not ${baseRepo}`);
        return false;
    }

    const sourceBranch = payload.pull_request.head.ref;

    if (sourceBranch === "master" ||
        sourceBranch === "staging" ||
        sourceBranch === "production" ||
        sourceBranch.startsWith("release/")) {

        console.log(`[${eventId}] ignoring event, source branch is ${sourceBranch}}`);
        return false;
    }

    return true;
}

const hook = new GitHubWebhook("hook", {
    repositories: [{owner: "ellismg", repo: "testing"}],
    events: ["pull_request"],
    handler: async(e) => {
        const prEvent = <ghEvents.PullRequest>e.data;

        console.log(`[${e.id}] processing event}`);

        if (shouldDeleteBranch(e.id, prEvent)) {
            const ownerName = prEvent.pull_request.head.user.login;
            const ownerRepo = prEvent.pull_request.head.repo.name;
            const refName = prEvent.pull_request.head.ref;

            console.log(`[${e.id}] deleting ${ownerName}:${ownerRepo}@${refName}`);

            const octokit: GitHubApi = require("@octokit/rest")();
            octokit.authenticate({
                type: "token",
                token: ghToken,
            });

            await octokit.gitdata.deleteReference({
                owner: ownerName,
                repo: ownerRepo,
                ref: `heads/${refName}`,
            });
        }
    },
});

export const url = hook.url;
