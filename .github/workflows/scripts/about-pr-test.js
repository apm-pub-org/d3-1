// This script uses GitHub's Octokit SDK to make API requests.
import { Octokit } from "octokit";

/**
 * Determines the size of a pull request based on the number of files changed and lines added/deleted.
 *
 * @param {Object} params.octokit - An Octokit instance for making GitHub API requests. The token used to create the instance must have `read` permission for pull requests.
 * @param {number} params.prNumber - The number of the pull request.
 * @param {string} params.owner - The owner of the repository where the pull request is located.
 * @param {string} params.repo - The name of the repository where the pull request is located.
 *
 * @returns {Promise<string>} - A promise that resolves to the size of the pull request, which can be "tiny", "small", "medium", or "large".
 *
 */
async function getPullRequestSize({ octokit, prNumber, owner, repo }) {
  const { data } = await octokit.request(
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

  const numberLinesChanged = data.deletions + data.additions;
  const numberFilesChanged = data.changed_files;

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

  return prSize;
}

/**
 * Adds a comment to a pull request.
 *
 * @param {Object} params.octokit - An Octokit instance for making GitHub API requests. The token used to create the instance must have `write` permission for pull requests.
 * @param {number} params.prNumber - The number of the pull request.
 * @param {string} params.owner - The owner of the repository where the pull request is located.
 * @param {string} params.repo - The name of the repository where the pull request is located.
 * @param {string} params.comment - The comment to add to the pull request.
 *
 * @returns {Promise<void>} A promise that resolves when the comment has been added.
 */
async function commentOnPR({ octokit, prNumber, owner, repo, comment }) {
  // This endpoint is used to add a comment to both pull requests and issues
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

  // Error if any environment variables were not set.
  if (!TOKEN || !REPO_OWNER || !REPO_NAME || !PR_NUMBER) {
    console.error("Missing required environment variables.");
    process.exit(1);
  }

  // Create an instance of `Octokit` using the token value that was set in the GitHub Actions workflow.
  const octokit = new Octokit({
    auth: TOKEN,
  });

  try {
    // Get the size of the pull request.
    const prSize = await getPullRequestSize({
      octokit,
      repo: REPO_NAME,
      owner: REPO_OWNER,
      prNumber: PR_NUMBER,
    });

    // Comment on the pull request with its size.
    await commentOnPR({
      octokit,
      owner: REPO_OWNER,
      repo: REPO_NAME,
      prNumber: PR_NUMBER,
      comment: `PR size is ${prSize}`,
    });
  } catch (error) {
    console.error("Error processing the pull request:", error);
    process.exit(1);
  }
})();
