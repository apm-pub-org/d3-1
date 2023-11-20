import {setOutput, setFailed} from "@actions/core";
import {getOctokit, context} from "@actions/github";

async function docsOpenDocsIssue() {
  console.log("Opening docs-content issue...");

  const token = process.env.DOCS_TOKEN;
  const octokit = getOctokit(token);

  let labels = ["priority-0", "new-release"];
  labels = labels.concat(JSON.parse(process.env.GHES_LABELS));
  switch (process.env.TIER) {
    case "Tier 1":
      labels.push("Tier 1");
      break;
    case "Tier 2":
      labels.push("Tier 2");
      break;
    case "Tier 3":
      labels.push("Tier 3");
      break;
    case "Tier 4":
      labels.push("Tier 4");
      break;
    default:
      console.log("Tier not identified.");
  }

  console.log(`Labels to add: ${JSON.stringify(labels)}`);

  const docsContentIssue = await octokit.rest.issues.create({
    owner: context.repo.owner,
    repo: "second-repo",
    title: process.env.NEW_TITLE,
    body: process.env.NEW_BODY,
    labels: labels,
  });

  console.log(`Created docs-content issue ${docsContentIssue}`);

  setOutput("docsIssueNumber", docsContentIssue.data.number);
}

docsOpenDocsIssue().catch((error) => {
  setFailed(`docsOpenDocsIssue failed with error: ${error}`);
});
