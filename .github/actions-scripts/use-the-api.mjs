import { Octokit } from "octokit"

const octokit = new Octokit({
  auth: process.env.TOKEN
});

const issueData = await octokit.request("GET /repos/{owner}/{repo}/issues", {
     owner: "octocat",
     repo: "Spoon-Knife",
   });

const issueTitles = issueData.map(issue => issue.title);

console.log(issueTitles)
