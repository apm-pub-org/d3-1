import { graphql } from '@octokit/graphql'

import addItemsToProject from "./projects"

async function docsTeamMemberQ(login) {
  // Get all members of the docs team
  const data = await graphql(
    `
      query {
        organization(login: "github") {
          team(slug: "docs") {
            members {
              nodes {
                login
              }
            }
          }
        }
      }
    `,
    {
      headers: {
        authorization: `token ${process.env.TOKEN}`,
      },
    }
  )

  const teamMembers = data.organization.team.members.nodes.map((entry) => entry.login)

  return teamMembers.includes(login)
}

// Given a list of project item node IDs and a list of corresponding authors
// generates a GraphQL mutation to populate:
//   - "Status" (as "Ready for review" option)
//   - "Date posted" (as today)
//   - "Review due date" (as today + 2 weekdays)
//   - "Feature" (as "OpenAPI schema update")
//   - "Contributor type" (as "Hubber or partner" option)
// Does not populate "Review needs" or "Size"
function generateUpdateProjectNextItemFieldMutation(items, authors) {
  // Formats a date object into the required format for projects
  function formatDate(date) {
    return date.getFullYear() + '-' + (date.getMonth() + 1) + '-' + date.getDate()
  }

  // Calculate 2 weekdays from now (excluding weekends; not considering holidays)
  const datePosted = new Date()
  let daysUntilDue
  switch (datePosted.getDay()) {
    case 0: // Sunday
      daysUntilDue = 3
      break
    case 6: // Saturday
      daysUntilDue = 4
      break
    default:
      daysUntilDue = 2
  }
  const millisecPerDay = 24 * 60 * 60 * 1000
  const dueDate = new Date(datePosted.getTime() + millisecPerDay * daysUntilDue)

  // Build the mutation for a single field
  function generateMutation({ index, item, fieldID, value, literal = false }) {
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
    ${generateMutation({
      index: index,
      item: item,
      fieldID: '$statusID',
      value: '$readyForReviewID',
    })}
    ${generateMutation({
      index: index,
      item: item,
      fieldID: '$datePostedID',
      value: formatDate(datePosted),
      literal: true,
    })}
    ${generateMutation({
      index: index,
      item: item,
      fieldID: '$reviewDueDateID',
      value: formatDate(dueDate),
      literal: true,
    })}
    ${generateMutation({
      index: index,
      item: item,
      fieldID: '$contributorTypeID',
      value: '$contributorType',
    })}
    ${generateMutation({
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

  function findFieldID(fieldName, data) {
    const field = data.organization.projectNext.fields.nodes.find(
      (field) => field.name === fieldName
    )

    if (field && field.id) {
      return field.id
    } else {
      throw new Error(
        `A field called "${fieldName}" was not found. Check if the field was renamed.`
      )
    }
  }

  function findSingleSelectID(singleSelectName, fieldName, data) {
    const field = data.organization.projectNext.fields.nodes.find(
      (field) => field.name === fieldName
    )
    if (!field) {
      throw new Error(
        `A field called "${fieldName}" was not found. Check if the field was renamed.`
      )
    }

    const singleSelect = JSON.parse(field.settings).options.find(
      (field) => field.name === singleSelectName
    )

    if (singleSelect && singleSelect.id) {
      return singleSelect.id
    } else {
      throw new Error(
        `A single select called "${singleSelectName}" for the field "${fieldName}" was not found. Check if the single select was renamed.`
      )
    }
  }

  // Get the ID of the fields that we want to populate
  const datePostedID = findFieldID('Date posted', data)
  const reviewDueDateID = findFieldID('Review due date', data)
  const statusID = findFieldID('Status', data)
  const contributorTypeID = findFieldID('Contributor type', data)
  const authorID = findFieldID('Author', data)

  // Get the ID of the single select values that we want to set
  const readyForReviewID = findSingleSelectID('Ready for review', 'Status', data)
  const hubberTypeID = findSingleSelectID('Hubber or partner', 'Contributor type', data)
  const docsMemberTypeID = findSingleSelectID('Docs team', 'Contributor type', data)
  // Add the PRs to the project
  // todo could change addItemsToProject to take single or list
  // todo move common functions and import them
  const newItemIDs = await addItemsToProject([process.env.PR_NODE_ID], projectID)

  // Determine what "contributor type" to specify based on docs team membership
  const isDocsTeamMember = await docsTeamMemberQ(process.env.AUTHOR_LOGIN)
  const contributorType = isDocsTeamMember ? docsMemberTypeID : hubberTypeID

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
    contributorType: contributorType,
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
