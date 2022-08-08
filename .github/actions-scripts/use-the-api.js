import { Octokit } from "octokit";

const octokit = new Octokit({ 
  baseUrl: "http(s)://[hostname]/api/v3",
  auth: process.env.TOKEN,
});

await octokit.request("GET /octocat", {});
