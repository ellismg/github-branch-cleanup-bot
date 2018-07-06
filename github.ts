import * as pulumi from "@pulumi/pulumi";
import * as dynamic from "@pulumi/pulumi/dynamic";
import * as serverless from  "@pulumi/aws-serverless";

import * as GitHubApi from "@octokit/rest";
import { RandomResource } from "./random";

const ghToken = new pulumi.Config("github").require("token");

class GithubWebhookProvider implements dynamic.ResourceProvider {
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

        if (news["events"] === undefined) {
            failedChecks.push({property: "events", reason: "required property 'events' missing"});
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
        const octokit : GitHubApi = require("@octokit/rest")()
        octokit.authenticate({
            type: 'token',
            token: ghToken
        });

        const res = await octokit.repos.createHook({
            name: "web",
            owner: inputs["owner"],
            repo: inputs["repo"],
            events: inputs["events"],
            config: {
                content_type: "json",
                url: inputs["url"],
                secret: inputs["secret"],
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

        // the id property of GitHubApi.ReposEditHookParams has been deprecated but the
        // typescript definitions still mark it as required. Setting it causes a deprecation
        // warning at runtime, however, so we cast to ignore the error.
        const res = await octokit.repos.editHook(<GitHubApi.ReposEditHookParams>{
            hook_id: id,
            owner: news["owner"],
            repo: news["repo"],
            events: news["events"],
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

interface GitHubWebhookResourceArgs {
    url: pulumi.Input<string>
    owner: pulumi.Input<string>
    repo: pulumi.Input<string>
    events: pulumi.Input<string[]>
    secret?: pulumi.Input<string>
}

class GitHubWebhookResource extends dynamic.Resource {
    constructor(name: string, args: GitHubWebhookResourceArgs, opts?: pulumi.ResourceOptions) {
        super(new GithubWebhookProvider(), name, args, opts);
    }
}

export interface GitHubRepository {
    owner: string
    name: string
}

export interface GitHubWebhookRequest {
    request: serverless.apigateway.Request
    type: string,
    id: string,
    data: any
}

export interface GitHubWebhookArgs {
    repositories: GitHubRepository[]
    handler: (req: GitHubWebhookRequest) => Promise<void>
    events: string[]
}

export class GitHubWebhook extends pulumi.ComponentResource {
    public readonly url : pulumi.Output<string>

    constructor(name: string, args: GitHubWebhookArgs, opts? : pulumi.ResourceOptions) {
        super("github:rest:Hook", name, {}, opts);

        const secret = new RandomResource(`${name}-secret`);

        const api = new serverless.apigateway.API("hook", {
            routes: [
                {
                    path: "/",
                    method: "POST",
                    handler: async (req) => {
                        const eventType = req.headers['X-GitHub-Event'];
                        const eventId = req.headers['X-GitHub-Delivery'];
                        const eventSig = req.headers['X-Hub-Signature'];

                        if (!(eventType && eventId && eventSig && req.body)) {
                            return {
                                statusCode: 400,
                                body: "missing parameter"
                            };
                        }

                        const body = Buffer.from(req.body, req.isBase64Encoded ? 'base64' : 'utf8');

                        const crypto = await import("crypto");
                        const hmac = crypto.createHmac("sha1", secret.value.get());
                        hmac.update(body);

                        const digest = `sha1=${hmac.digest("hex")}`;

                        if (!crypto.timingSafeEqual(Buffer.from(eventSig), Buffer.from(digest))) {
                            console.log(`[${eventId}] ignorning, bad signature ${digest} != ${eventSig}`);
                            return {
                                statusCode: 400,
                                body: "bad signature"
                            };
                        }

                        const event = JSON.parse(body.toString());

                        await args.handler({
                            request: req,
                            type: eventType,
                            id: eventId,
                            data: event,
                        });

                        return {
                            statusCode: 200,
                            body: ""
                        };
                    }
                }
            ]
        });

        if (args.repositories !== undefined) {
            for (let repo of args.repositories) {
                new GitHubWebhookResource(`${name}-registration-${repo.owner}-${repo.name}`, {
                    owner: repo.owner,
                    repo: repo.name,
                    secret: secret.value,
                    events: ["pull_request"],
                    url: api.url,
                });
            }
        }

        this.url = api.url;
    }
}