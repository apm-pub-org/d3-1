import { Octokit } from "octokit";

async function getPullRequestSize({ octokit, repo, owner, prNumber }) {
  console.log(`getPullRequestSize ${repo} ${owner} ${prNumber}`)
  const {data} = await octokit.request(
    "GET /repos/{owner}/{repo}/pulls/{pull_number}",
    {
      owner,
      repo,
      pull_number: prNumber,
      headers: {
        "x-github-api-version": "2022-11-28",
      },
    },
  );

  console.log("done calling")
  console.log(JSON.stringify(data))
  const numberLinesChanged = data.deletions + data.additions;
  const numberFilesChanged = data.changed_files;

  console.log(`numberLinesChanged: ${numberLinesChanged} (${data.deletions} + ${data.additions})`)
  console.log(`numberFilesChanged: ${numberFilesChanged}`)

  let prSize;
  if (numberFilesChanged < 5 && numberLinesChanged < 10) {
    prSize = "tiny";
  } else if (numberFilesChanged < 10 && numberLinesChanged < 50) {
    prSize = "small";
  } else if (numberFilesChanged < 10 && numberLinesChanged < 250) {
    prSize = "medium";
  } else {
    prSize = "large";
  }

  console.log(`prSize ${prSize}`)
  return prSize;
}

async function commentOnPR({ octokit, owner, repo, prNumber, comment }) {
  console.log(`commentOnPR ${repo} ${owner} ${prNumber}`)

  await octokit.request(
    "POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
    {
      owner,
      repo,
      issue_number: prNumber,
      body: comment,
      headers: {
        "x-github-api-version": "2022-11-28",
      },
    },
  );
}

(async () => {
  // Get the values of environment variables that were set by the GitHub Actions workflow.
  const TOKEN = process.env.TOKEN;
  const REPO_OWNER = process.env.REPO_OWNER;
  const REPO_NAME = process.env.REPO_NAME;
  const PR_NUMBER = process.env.PR_NUMBER;

  console.log(`REPO_OWNER: ${REPO_OWNER}`)
  console.log(`REPO_NAME: ${REPO_NAME}`)
  console.log(`PR_NUMBER: ${PR_NUMBER}`)

  if (!TOKEN || !REPO_OWNER || !REPO_NAME || !PR_NUMBER) {
    console.error("Missing required environment variables.");
    process.exit(1);
  }

  // Create an instance of `Octokit` using the token value that was set in the GitHub Actions workflow.
  const octokit = new Octokit({
    auth: TOKEN,
  });

  // todo catch errors

  const prSize = await getPullRequestSize({
    octokit,
    repo: REPO_NAME,
    owner: REPO_OWNER,
    prNumber: PR_NUMBER,
  });

  await commentOnPR({
    octokit,
    owner: REPO_OWNER,
    repo: REPO_NAME,
    prNumber: PR_NUMBER,
    comment: `PR size is ${prSize}`,
  });
})();
