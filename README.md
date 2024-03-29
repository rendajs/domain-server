# Renda domain server

This repository contains code responsible for hosting the following domains:

- [**rendajs.org**](https://rendajs.org) - Main landing page of the Renda project.
- [**renda.studio**](https://renda.studio) - Stable releases of Renda Studio.
  - [**canary.renda.studio**](https://canary.renda.studio) - Bleeding edge releases of Renda Studio, updated with every commit to the main branch.
  - [**staging.renda.studio**](https://staging.renda.studio) - New releases are deployed here for some final checks before deploying to production.
  - [**bisect.renda.studio**](https://bisect.renda.studio) - Allows you to bisect canary builds of Renda Studio in order to find the source of regressions.
  - **deploy.renda.studio** - Used for deploying new Renda Studio versions.
  - **pr-`[pull request id]`.renda.studio** - Preview domains for submitted pull requests.
  - **commit-`[commit hash]`.renda.studio** - Hosts past versions of Renda Studio for every commit in the main branch. Used for bisecting or just for viewing older canary versions.
  - **discovery.renda.studio** - Hosts a WebSocket for connecting studio instances via WebRTC. The code for this can be found in [a separate repository](https://github.com/rendajs/studio-discovery-server).

Whenever a new version, PR or commit is deployed, files are written to disk.
You can specify the location of this direcotry using the `WWW_DIR` environment variable.

## Running locally

To make changes to the code and try them out, you can run `deno task dev`, which will start the server locally.
A random port is picked every time the application starts or when a file is changed,
but you can specify a specific port with the `PORT` environment variable.
For instance `PORT=8080 deno task dev` will start the server on port 8080.

Once the server is running, you can try out the different domains by appending them to `http://localhost:8080/`.
For instance, if you visit http://localhost:8080/https://renda.studio/ in your browser,
you will view the page that would normally be hosted at https://renda.studio/.
