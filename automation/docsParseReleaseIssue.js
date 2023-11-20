import {setOutput, setFailed} from "@actions/core";
import {getOctokit, context} from "@actions/github";

function getStringBetween(input, before, after) {
  // i = case insensitive, s = match newlines
  const re = new RegExp(before + "(.*?)" + after, "is");
  const result = input.match(re);
  if (result) {
    return result[1].trim();
  } else {
    console.log(
      `String between ${before} and ${after} was not found. Check if the release template changed.`,
    );
    return result;
  }
}

// Function to check for GHES pattern in comments
async function checkGHESInComments({owner, repo, issue_number, octokit}) {
  const comments = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number,
  });

  const ghesCheckboxChecked = "- [x] Is this Shipping to GHES?";
  for (const comment of comments.data) {
    if (comment.body.includes(ghesCheckboxChecked)) {
      return "Yes";
    }
  }
  return "No"; // Default to 'No' if pattern is not found in any comment
}

function compileIssueBody(shipDate, issue) {
  return `
  ## Release details

  _This table interacts with our project boards ([learn how issue fields work](https://howie-docs.githubapp.com/features/issue-fields/))._
  <!-- issue-fields start -->

    | Field | Value |
    | ----- | ----- |
    | Target date | ${shipDate} |
    | Release issue | ${issue} |
    | Release FAQ | To be added (once the FAQ is added to the release issue) |

  <!-- issue-fields end -->

  ## Required resources

  Docs team [lead time](https://github.com/github/docs-team/blob/main/contributing-to-docs/how-to-work-with-docs-content.md#lead-times-for-documenting-releases) to prepare documentation is **2 weeks minimum**. This lead time begins _after_ the following is provided:

  - [ ] Release FAQ or similar information
  - [ ] Access to the feature through feature flag or staff ship
  - [ ] _other information here_

  <details>
  <summary>How to use this issue</summary>

  Every issue in github/releases automatically opens an issue in github/docs-content for the Docs team to triage.

  - **Writer FRs**: Add the product label(s) for the appropriate Docs focus team. If you need help, consult a [focus area DRI](https://github.com/github/docs-content/tree/main/focus-areas).
  - **Docs focus area DRIs**: For public beta and GA releases, determine whether the release needs new documentation or requires updates to existing docs, collaborating with the product team as needed. If no docs updates are needed, close this issue as not planned. For alpha and private beta releases, work with the product team as needed to support self-publishing.

  </details>

  <details>
  <summary>Documentation at different release phases</summary>

  Public documentation on GitHub Docs begins at public beta, or at private beta if the beta is widely publicized or made available to a broad user base.

  For alphas and private betas, product teams can create and publish their own private documentation with Docs team help. Documentation at these phases is optional but highly recommended. See the [Preview Guide](https://github.com/github/product/blob/main/GitHub%20Preview%20Resources/preview-guide.md#documenting-your-preview) for instructions.

  If this release has a small docs impact, invite the product manager or another stakeholder to update the docs after you create the content design plan.
  </details>
  `;
}

async function docsParseReleaseIssue() {
  console.log("Parsing the release issue...");

  const token = process.env.GITHUB_TOKEN;
  const octokit = getOctokit(token);

  const labels = context.payload.issue.labels;

  // todo it looks like phase isn't used anywhere
  let phase = "unknown";
  for (const label of labels) {
    if (
      [
        "Alpha",
        "Private Beta",
        "Public Beta",
        "Limited Public Beta",
        "GA",
        "Deprecation",
      ].includes(label.name)
    ) {
      phase = label.name;
      break;
    }
  }
  console.log(`Found phase of ${phase}`);

  let tier = "unknown";
  for (const label of labels) {
    if (["Tier 1", "Tier 2", "Tier 3", "Tier 4"].includes(label.name)) {
      tier = label.name;
      break;
    }
  }
  console.log(`Found tier of ${tier}`);

  const body = context.payload.issue.body;

  const shipDate = getStringBetween(body, "Expected ship date", "###");
  console.log(`Found shipDate of ${shipDate}`);

  // Existing method to determine GHES shipping status
  let ghesAnswer = getStringBetween(
    body,
    "Will this feature, in its current release phase, flow into GitHub Enterprise Server\\?",
    "###",
  );

  console.log(`Found ghesAnswer (in the body) of ${ghesAnswer}`);

  // If existing pattern not found, check the first comment
  // todo I don't think this will work unless the comment was added between the time that the workflow started due to the issue.opened trigger and the time that this block is executed
  if (!ghesAnswer) {
    console.log("Attempting to get GHES info from comments...")
    ghesAnswer = await checkGHESInComments({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: context.issue.number,
      octokit,
    });
    console.log(`Found ghesAnswer (in the comments) of ${ghesAnswer}`);
  }

  let ghesLabels = [];
  if (ghesAnswer.startsWith("Yes")) {
    ghesLabels.push("GHES");
    try {
      console.log("Attempting to get GHES version...")
      const ghesVersion = body.match(/[+-]?\d+(\.\d+)?/g)
        ? body.match(/[+-]?\d+(\.\d+)?/g)[0]
        : null;
        console.log(`Found ghesVersion of ${ghesVersion}`);
      if (ghesVersion) {
        ghesLabels.push(`GHES ${ghesVersion}`);
      }
    } catch (error) {
      console.log("GHES version could not be determined");
    }
  }
  console.log(`ghesLabels: ${JSON.stringify(ghesLabels)}`);

  const title = context.payload.issue.title;

  const issue = context.payload.issue.html_url;
  const newTitle = `${title}`;
  const newBody = compileIssueBody(shipDate, issue);
  setOutput("newTitle", newTitle);
  setOutput("newBody", newBody);
  setOutput("tier", tier);
  // Since this is an array, need to stringify it
  setOutput("ghesLabels", JSON.stringify(ghesLabels));
}

docsParseReleaseIssue().catch((error) => {
  setFailed(`docsParseReleaseIssue failed with error: ${error}`);
});
