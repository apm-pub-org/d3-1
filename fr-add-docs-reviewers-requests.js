const { graphql } = require("@octokit/graphql");

// Given a list of PR/issue node IDs and a project node ID,
// adds the PRs/issues to the project
// and returns the node IDs of the project items
async function addItemsToProject(items, project) {
  console.log(`Adding items ${items} to project ${project}`)

  const mutations = items.map((pr, index) => `
    pr_${index}: addProjectNextItem(input: {
      projectId: $project
      contentId: "${pr}"
    }) {
      projectNextItem {
        id
      }
    }
    `
  )

  const mutation = `
  mutation($project:ID!) {
    ${mutations.join(' ')}
  }
  `

  const newItems = await graphql(
    mutation,
    {
      project: project,
      headers: {
        authorization: `token ${process.env.TOKEN}`,
        "GraphQL-Features": "projects_next_graphql",
      },
    }
  );

  const newItemIDs = Object.entries(newItems).map(item => item[1].projectNextItem.id)

  console.log(`New items added: ${newItemIDs}`)

  return newItemIDs
}

// Given a list of project item node IDs and a list of corresponding authors
// generates a GraphQL mutation to populate:
//   - status (as "Ready for review" option)
//   - datePosted (as today)
//   - reviewDueDate (as today + 2 weekdays)
//   - feature (as "OpenAPI schema update")
//   - contributorType (as "Hubber or partner" option) todo may want to make this dependent on author
// Not populating review needs or size
function generateUpdateProjectNextItemFieldMutation(items, authors) {

  // Formats a date object into the required format for projects
  function formatDate(date) {
    return date.getFullYear() + '-' + date.getMonth() + '-' + date.getDate()
  }

  // Calculate 2 weekdays from now (excluding weekends; not considering holidays)
  const datePosted = new Date()
  let daysUntilDue
  switch (datePosted.getDay()) {
    case 0: // Sunday
      daysUntilDue = 3
      break;
    case 6: // Saturday
      daysUntilDue = 4
      break;
    default:
      daysUntilDue = 2
  }
  const dueDate = new Date(datePosted.getTime() + (24 * 60 * 60 * 1000 * daysUntilDue))

  // Build the mutation for a single field
  function generateMutation(index, item, fieldID, value, literal = false) {
    let parsedValue
    if (literal) {
      parsedValue = `value: "${value}"`
    } else {
      parsedValue = `value: ${value}`
    }

    return `
      set_${fieldID.substr(1)}_item_${index}: updateProjectNextItemField(input: {
        projectId: $project
        itemId: "${item}"
        fieldId: ${fieldID}
        ${parsedValue}
      }) {
      projectNextItem {
        id
      }
    }
    `
  }

  // Build the mutation for all fields for all items
  const mutations = items.map((item, index) => `
    ${generateMutation(index, item, "$statusID", "$readyForReviewID")}
    ${generateMutation(index, item, "$datePostedID", formatDate(datePosted), true)}
    ${generateMutation(index, item, "$reviewDueDateID", formatDate(dueDate), true)}
    ${generateMutation(index, item, "$contributorTypeID", "$hubberTypeID")}
    ${generateMutation(index, item, "$featureID", "OpenAPI schema update", true)}
    ${generateMutation(index, item, "$authorID", authors[index], true)}
  `
  )

  // Build the full mutation
  const mutation = `
    mutation(
      $project: ID!
      $statusID: ID!
      $readyForReviewID: String!
      $datePostedID: ID!
      $reviewDueDateID: ID!
      $contributorTypeID: ID!
      $hubberTypeID: String!
      $featureID: ID!
      $authorID: ID!

    ) {
      ${mutations.join(' ')}
    }
    `

  return mutation
}

async function run() {

  // Inputs todo maybe take as input from workflow instead

  const projectNumber = 10// todo change
  const organization = "ske-test-org"// todo change
  const repo = "test-org-repo"// todo change
  const reviewerName = "test-team" // todo change
  // 100 is an educated guess of how many PRs are opened in a day on the github/github repo
  // If we are missing PRs, either increase this number or increase the frequency at which this script is run
  const numPRsToSearch = 100

  // Get info about the docs-content review board project
  // and about open github/github PRs
  const data = await graphql(
    `
      query (
        $organization: String!
        $repo: String!
        $projectNumber: Int!
        $num_prs: Int!
      ) {
        organization(login: $organization) {
          projectNext(number: $projectNumber) {
            id
            fields(first:20) {
              nodes {
                id
                name
                settings
              }
            }
          }
        },
        repository(name: $repo, owner: $organization){
          pullRequests(last: $num_prs, states: OPEN) {
            nodes {
              id
              isDraft
              reviewRequests(first: 10) {
                nodes {
                  requestedReviewer {
                    ... on Team {
                      name
                    }
                  }
                }
              }
              labels(first: 5) {
                nodes {
                  name
                }
              }
              reviews(first: 10){
                nodes{
                  onBehalfOf(first: 1){
                    nodes{
                      name
                    }
                  }
                }
              }
              author{
                login
              }
            }
          }
        }
      }
    `,
    {
      organization: organization,
      repo: repo,
      projectNumber: projectNumber,
      num_prs: numPRsToSearch,
      headers: {
        authorization: `token ${process.env.TOKEN}`,
        "GraphQL-Features": "projects_next_graphql",
      },
    }
  );

  // Get the PRs that are:
  // - not draft
  // - not a train
  // - are requesting a review by docs-reviewers
  // - have not already been reviewed on behalf of docs-reviewers
  // - are not already on the specified project board // todo not possible yet
  const prs = data.repository.pullRequests.nodes.filter(pr =>
    !pr.isDraft
    && !pr.labels.nodes.find(label => label.name === "Deploy train 🚂")
    && pr.reviewRequests.nodes.find(requestedReviewers => requestedReviewers.requestedReviewer.name === reviewerName)
    && !pr.reviews.nodes.flatMap(review => review.onBehalfOf.nodes).find(behalf => behalf.name === reviewerName)
  )
  if (prs.length === 0) {
    console.log("No PRs found. Exiting.")
    return
  }

  const prIDs = prs.map(pr => pr.id)
  const prAuthors = prs.map(pr => pr.author.login)
  console.log(`PRs found: ${prIDs}`)

  // Get the project ID
  const projectID = data.organization.projectNext.id

  // Get the ID of the fields that we want to populate
  const datePostedID = data.organization.projectNext.fields.nodes.find(field => field.name === "Date posted").id
  const reviewDueDateID = data.organization.projectNext.fields.nodes.find(field => field.name === "Review due date").id
  const statusID = data.organization.projectNext.fields.nodes.find(field => field.name === "Status").id
  const featureID = data.organization.projectNext.fields.nodes.find(field => field.name === "Feature").id
  const contributorTypeID = data.organization.projectNext.fields.nodes.find(field => field.name === "Contributor type").id
  const authorID = data.organization.projectNext.fields.nodes.find(field => field.name === "Author").id

  // Get the ID of the single select values that we want to set
  const readyForReviewID = JSON.parse(data.organization.projectNext.fields.nodes.find(field => field.name === "Status").settings).options.find(field => field.name === "Ready for review").id
  const hubberTypeID = JSON.parse(data.organization.projectNext.fields.nodes.find(field => field.name === "Contributor type").settings).options.find(field => field.name === "Hubber or partner").id

  // Add the PRs to the project
  const newItemIDs = await addItemsToProject(prIDs, projectID)

  // Populate fields for the new project items
  // Note: Since there is not a way to check if a PR is already on the board, 
  // this will overwrite the values of PRs that are on the board
  const updateProjectNextItemMutation = generateUpdateProjectNextItemFieldMutation(newItemIDs, prAuthors)
  console.log('Populating fields')

  await graphql(
    updateProjectNextItemMutation,
    {
      project: projectID,
      statusID: statusID,
      readyForReviewID: readyForReviewID,
      datePostedID: datePostedID,
      reviewDueDateID: reviewDueDateID,
      contributorTypeID: contributorTypeID,
      hubberTypeID: hubberTypeID,
      featureID: featureID,
      authorID: authorID,
      headers: {
        authorization: `token ${process.env.TOKEN}`,
        "GraphQL-Features": "projects_next_graphql",
      },
    }
  );
  console.log('Done populating fields')

  return newItemIDs
}

run()
  .then(
    (response) => { console.log(JSON.stringify(response)) },
    (error) => {
      console.log(`#ERROR# ${error}`)
      process.exit(1)
    }
  )

  // todo use typescript
  // todo use by action
  // TODO in initial query, get all item ids in project; exclude these before updating fields
