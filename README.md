# GitHub Branch Cleanup Bot

## Overview

This is a small bot that deletes topic branches for pull requests that have been merged. At [Pulumi](https://pulumi.com) we use a topic branch based workflow in our repositories, but I'm really bad about deleting my topic branches once a pull request has been merged. I figured I might as well write a bot to handle this for me and the other developers at Pulumi. Since Pulumi makes it super easy to build serverless infrastructure and abstractions, it was pretty easy to do so.

## How it works

The hook logic is in `[index.ts](./index.ts)`. The `GitHubWebhook` class is a Pulumi Component Resource that manages all of the infrastructure needed for the Webhook itself and handles registering it with GitHub. `GitHubWebhook` is defined in `[github.ts](./github.ts)` and is responsible for creating the serverless API that backs the hook, registering the hook with GitHub and doing some initial validation of requests to the hook. When a message is sent to the hook, it validates that the message came from GitHub (by using the [`X-Hub-Signature` header](https://developer.github.com/webhooks/#delivery-headers) and if the message is authnetic, calls into a user provided handler. The handler only has to concern itself with processing a valid hook.

By using the `repositories` and `organizations` properties on `GitHubWebhookArgs`, the same hook can be installed across multiple repositories and organizations. Only a single HTTP endpoint is created and it is shared across all . The set of events the hook is registered for is controled by the `events` property. The list of valid event types are [documented by GitHub](https://developer.github.com/webhooks/#events)