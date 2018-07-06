import * as pulumi from "@pulumi/pulumi";
import * as dynamic from "@pulumi/pulumi/dynamic";

import * as GitHubApi from "@octokit/rest";

const ghToken = new pulumi.Config("github").require("token");

export class GithubWebhookProvider implements dynamic.ResourceProvider {
    
    check = (olds: any, news: any) => {
        const failedChecks : dynamic.CheckFailure[] = [];

        if (news["url"] === undefined) {
            failedChecks.push({property: "url", reason: "required property 'url' missing"});
        }

        if (news["owner"] === undefined) {
            failedChecks.push({property: "owner", reason: "required property 'owner' missing"});
        }

        if (news["repo"] === undefined) {
            failedChecks.push({property: "repo", reason: "required property 'repo' missing"});
        }

		return Promise.resolve({ inputs: news, failedChecks: failedChecks });
    };
    
    diff = (id: pulumi.ID, olds: any, news: any) => {
        const replaces : string[] = [];

        for (const prop of ["owner", "repo"]) {
            if (olds[prop] !== news[prop]) {
                replaces.push(prop);
            }
        }        
        
        return Promise.resolve({replaces: replaces});
    };

    create = async (inputs: any) => {
        const crypto = await import("crypto");
        crypto.randomBytes(32)

        const octokit : GitHubApi = require("@octokit/rest")()
        octokit.authenticate({
            type: 'token',
            token: ghToken
        });

        const res = await octokit.repos.createHook({
            name: "web",
            owner: inputs["owner"],
            repo: inputs["repo"],
            events: ["pull_request"],
            config: {
                content_type: "json",
                url: inputs["url"],
            }
        });

        if (res.status !== 201) {
            throw new Error(`bad response: ${JSON.stringify(res)}`);
        }

        return {
            id: `${res.data["id"]}`,
        };
    }

    update = async (id: string, olds: any, news: any) => {
        const octokit : GitHubApi = require("@octokit/rest")()
        octokit.authenticate({
            type: 'token',
            token: ghToken
        });

        const res = await octokit.repos.editHook(<GitHubApi.ReposEditHookParams>{
            hook_id: id,
            owner: news["owner"],
            repo: news["repo"],
            events: ["pull_request"],
            config: {
                content_type: "json",
                url: news["url"],
            }           
        });

        return {
            outs: {
                id: res.data.id
            }
        }
    }

    delete = async (id: pulumi.ID, props: any) => {
        const octokit : GitHubApi = require('@octokit/rest')()

        octokit.authenticate({
            type: 'token',
            token: ghToken
        });

        // the id property of GitHubApi.ReposDeleteHookParams has been deprecated but the
        // typescript definitions still mark it as required. Setting it causes a deprecation
        // warning at runtime, however, so we cast to ignore the error.
        const res = await octokit.repos.deleteHook(<GitHubApi.ReposDeleteHookParams>{
            hook_id: id,
            owner: props["owner"],
            repo: props["repo"],
        });

        if (res.status !== 204) {
            throw new Error(`bad response: ${JSON.stringify(res)}`);
        }        
    }
}

export interface GitHubWebhookResourceArgs {
    url: pulumi.Input<string>
    owner: pulumi.Input<string>
    repo: pulumi.Input<string>
}

export class GitHubWebhookResource extends dynamic.Resource {
    constructor(name: string, args: GitHubWebhookResourceArgs, opts?: pulumi.ResourceOptions) {
        super(new GithubWebhookProvider(), name, args, opts);
    }
}
