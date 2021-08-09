import { graphql } from '@octokit/graphql'

import {
  addItemsToProject,
  docsTeamMemberQ,
  findFieldID,
  findSingleSelectID,
  formatDateForProject,
  calculateDueDate,
} from './projects.js'

// todo make it so that contributor type is variable. will need to make sure to only pass the variable that is used. will also need to get repo to determing contributor type;

// Given a project item node IDs and author login
// generates a GraphQL mutation to populate:
//   - "Status" (as variable passed with the request)
//   - "Date posted" (as today)
//   - "Review due date" (as today + {turnaround} weekdays)
//   - "Contributor type" (as variable passed with the request)
//   - "Feature" (as {feature})
//   - "Author" (as {author})"
// Does not populate "Review needs" or "Size"
//todo convert to named args

function generateUpdateProjectNextItemFieldMutation(item, author, turnaround = 2, feature = '') {
  const datePosted = new Date()
  const dueDate = calculateDueDate(datePosted, turnaround)

  // Build the mutation to update a single project field
  // Specify literal=true to indicate that the value should be used as a string, not a variable
  function generateMutationToUpdateField({ item, fieldID, value, literal = false }) {
    let parsedValue
    if (literal) {
      parsedValue = `value: "${value}"`
    } else {
      parsedValue = `value: ${value}`
    }

    return `
      set_${fieldID.substr(1)}_item_${item}: updateProjectNextItemField(input: {
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

  const mutation = `
    mutation(
      $project: ID!
      $statusID: ID!
      $statusValueID: String!
      $datePostedID: ID!
      $reviewDueDateID: ID!
      $contributorTypeID: ID!
      $contributorType: String!
      $featureID: ID!
      $authorID: ID!
    ) {
      ${generateMutationToUpdateField({
    item: item,
    fieldID: '$statusID',
    value: '$statusValueID',
  })}
      ${generateMutationToUpdateField({
    item: item,
    fieldID: '$datePostedID',
    value: formatDateForProject(datePosted),
    literal: true,
  })}
      ${generateMutationToUpdateField({
    item: item,
    fieldID: '$reviewDueDateID',
    value: formatDateForProject(dueDate),
    literal: true,
  })}
      ${generateMutationToUpdateField({
    item: item,
    fieldID: '$contributorTypeID',
    value: '$contributorType',
  })}
      ${generateMutationToUpdateField({
    item: item,
    fieldID: '$featureID',
    value: feature,
    literal: true,
  })}
      ${generateMutationToUpdateField({
    item: item,
    fieldID: '$authorID',
    value: author,
    literal: true,
  })}
      }
    `

  return mutation
}

async function run() {
  // Get info about the docs-content review board project
  const data = await graphql(
    `
      query ($organization: String!, $projectNumber: Int!) {
        organization(login: $organization) {
          projectNext(number: $projectNumber) {
            id
            fields(first: 20) {
              nodes {
                id
                name
                settings
              }
            }
          }
        }
      }
    `,
    {
      organization: process.env.ORGANIZATION,
      projectNumber: parseInt(process.env.PROJECT_NUMBER),
      headers: {
        authorization: `token ${process.env.TOKEN}`,
        'GraphQL-Features': 'projects_next_graphql',
      },
    }
  )

  // Get the project ID
  const projectID = data.organization.projectNext.id

  // Get the ID of the fields that we want to populate
  const datePostedID = findFieldID('Date posted', data)
  const reviewDueDateID = findFieldID('Review due date', data)
  const statusID = findFieldID('Status', data)
  const featureID = findFieldID('Feature', data)
  const contributorTypeID = findFieldID('Contributor type', data)
  const authorID = findFieldID('Author', data)

  // Get the ID of the single select values that we want to set
  const readyForReviewID = findSingleSelectID('Ready for review', 'Status', data)
  const hubberTypeID = findSingleSelectID('Hubber or partner', 'Contributor type', data)
  const docsMemberTypeID = findSingleSelectID('Docs team', 'Contributor type', data)
  const osContributorTypeID = findSingleSelectID('OS contributor', 'Contributor type', data)

  // Add the PRs to the project
  const newItemIDs = await addItemsToProject([process.env.PR_NODE_ID], projectID)

  // Given the author login and repo, determine which variable to use for the contributor type
  function getContributorID(author, repo) {

    const isDocsTeamMember = docsTeamMemberQ(author)

    if (isDocsTeamMember) return docsMemberTypeID

    if (repo === "github/docs") return osContributorTypeID

    return hubberTypeID
  }

  // Populate fields for the new project items
  for (const itemID of newItemIDs) {
    const updateProjectNextItemMutation = generateUpdateProjectNextItemFieldMutation(itemID, process.env.AUTHOR_LOGIN, 2)
    console.log(process.env.PR_REPO)
    const contributorType = getContributorID(process.env.AUTHOR_LOGIN, process.env.PR_REPO)//todo need to pass repo to action¸
    console.log(`Populating fields for item: ${newItemIDs}`)

    await graphql(updateProjectNextItemMutation, {
      project: projectID,
      statusID: statusID,
      statusValueID: readyForReviewID,
      datePostedID: datePostedID,
      reviewDueDateID: reviewDueDateID,
      contributorTypeID: contributorTypeID,
      contributorType: contributorType,
      featureID: featureID,
      authorID: authorID,
      headers: {
        authorization: `token ${process.env.TOKEN}`,
        'GraphQL-Features': 'projects_next_graphql',
      },
    })
    console.log('Done populating fields for item')

  }

  return newItemIDs
}

run().catch((error) => {
  console.log(`#ERROR# ${error}`)
  process.exit(1)
})
