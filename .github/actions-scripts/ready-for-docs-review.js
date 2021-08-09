import { graphql } from '@octokit/graphql'

import { addItemsToProject, docsTeamMemberQ, findFieldID, findSingleSelectID, formatDateForProject, calculateDueDate } from "./projects.js"



// Given a list of project item node IDs and a list of corresponding authors
// generates a GraphQL mutation to populate:
//   - "Status" (as "Ready for review" option)
//   - "Date posted" (as today)
//   - "Review due date" (as today + 2 weekdays)
//   - "Feature" (as "OpenAPI schema update")
//   - "Contributor type" (as "Hubber or partner" option)
// Does not populate "Review needs" or "Size"
function generateUpdateProjectNextItemFieldMutation(items, authors, feature = "", turnaround = 2) {

  const datePosted = new Date()
  const dueDate = calculateDueDate(datePosted, turnaround)

  // Build the mutation to update a single project field
  // Specify literal=true to indicate that the value should be used as a string, not a variable
  function generateMutationToUpdateField({ index, item, fieldID, value, literal = false }) {
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
  const mutations = items.map(
    (item, index) => `
    ${generateMutationToUpdateField({
      index: index,
      item: item,
      fieldID: '$statusID',
      value: '$readyForReviewID',
    })}
    ${generateMutationToUpdateField({
      index: index,
      item: item,
      fieldID: '$datePostedID',
      value: formatDateForProject(datePosted),
      literal: true,
    })}
    ${generateMutationToUpdateField({
      index: index,
      item: item,
      fieldID: '$reviewDueDateID',
      value: formatDateForProject(dueDate),
      literal: true,
    })}
    ${generateMutationToUpdateField({
      index: index,
      item: item,
      fieldID: '$contributorTypeID',
      value: '$hubberTypeID',
    })}
    ${generateMutationToUpdateField({
      index: index,
      item: item,
      fieldID: '$featureID',
      value: feature,
      literal: true,
    })}
    ${generateMutationToUpdateField({
      index: index,
      item: item,
      fieldID: '$authorID',
      value: authors[index],
      literal: true,
    })}
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
      $contributorType: String!
      $authorID: ID!

    ) {
      ${mutations.join(' ')}
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
  // todo could change addItemsToProject to take single or list
  // todo move common functions and import them
  const newItemIDs = await addItemsToProject([process.env.PR_NODE_ID], projectID)

  // Populate fields for the new project items
  // todo could change generateUpdateProjectNextItemFieldMutation to take single or list
  const updateProjectNextItemMutation = generateUpdateProjectNextItemFieldMutation(newItemIDs, [
    process.env.AUTHOR_LOGIN,
  ])
  console.log(`Populating fields for these items: ${newItemIDs}`)

  await graphql(updateProjectNextItemMutation, {
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
      'GraphQL-Features': 'projects_next_graphql',
    },
  })
  console.log('Done populating fields')

  return newItemIDs
}

run().catch((error) => {
  console.log(`#ERROR# ${error}`)
  process.exit(1)
})
