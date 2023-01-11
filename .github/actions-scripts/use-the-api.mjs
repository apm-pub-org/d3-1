import { Octokit } from "octokit"

const octokit = new Octokit({
  auth: process.env.TOKEN
});

const result = await octokit.request("GET /repos/{owner}/{repo}/issues", {
     owner: "octocat",
     repo: "Spoon-Knife",
   });

const issueTitles = result.data.map(issue => issue.title);

console.log(issueTitles)
