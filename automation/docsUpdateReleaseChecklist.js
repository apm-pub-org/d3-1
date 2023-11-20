import {setFailed} from "@actions/core";
import {getOctokit, context} from "@actions/github";

async function docsUpdateReleaseChecklist() {
  console.log("Adding the docs issue to the release checklist...");

  const checklistDocsUnlinkedText =
    '- [ ] 📘 **Docs ([docs][docs-content]):** \\<link to docs-content issue or write "N/A"\\>';
  const updatedDocsItemText = `- [ ] 📘 **Docs ([docs][docs-content]):** ${context.repo.owner}/docs-content/issues/${process.env.DOCS_CONTENT_ISSUE_NUMBER}`;

  const token = process.env.GITHUB_TOKEN;
  const octokit = getOctokit(token);

  if (context.payload.issue.body.includes(checklistDocsUnlinkedText)) {
    // Re-fetch the release issue body to minimize the time between reading
    // it and updating it
    const issue = await octokit.rest.issues.get({
      issue_number: context.issue.number,
      owner: context.repo.owner,
      repo: context.repo.repo,
    });
    const releaseIssueBody = issue.data.body;

    // Check again whether the text includes the standard unlinked text
    if (releaseIssueBody.includes(checklistDocsUnlinkedText)) {
      const updatedReleaseIssueText = releaseIssueBody.replace(
        checklistDocsUnlinkedText,
        updatedDocsItemText,
      );

      await octokit.rest.issues.update({
        issue_number: context.issue.number,
        owner: context.repo.owner,
        repo: context.repo.repo,
        body: updatedReleaseIssueText,
      });

      console.log("Successfully updated release issue text.");
    } else {
      console.log(
        `The string '${checklistDocsUnlinkedText}' was not found. This is usually because a link was already added manually.`,
      );
    }
  } else {
    console.log(
      `The string '${checklistDocsUnlinkedText}' was not found. This is usually because a link was already added manually.`,
    );
  }
}

docsUpdateReleaseChecklist().catch((error) => {
  setFailed(`docsUpdateReleaseChecklist failed with error: ${error}`);
});
