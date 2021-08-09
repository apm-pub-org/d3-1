import { graphql } from '@octokit/graphql'

// Pull out the node ID of a field
export function findFieldID(fieldName, data) {
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

// Pull out the node ID of a single select field value
export function findSingleSelectID(singleSelectName, fieldName, data) {
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

// Given a list of PR/issue node IDs and a project node ID,
// adds the PRs/issues to the project
// and returns the node IDs of the project items
export async function addItemsToProject(items, project) {
  console.log(`Adding ${items} to project ${project}`)

  const mutations = items.map(
    (pr, index) => `
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

  const newItems = await graphql(mutation, {
    project: project,
    headers: {
      authorization: `token ${process.env.TOKEN}`,
      'GraphQL-Features': 'projects_next_graphql',
    },
  })

  // The output of the mutation is
  // {"pr_0":{"projectNextItem":{"id":ID!}},...}
  // Pull out the ID for each new item
  const newItemIDs = Object.entries(newItems).map((item) => item[1].projectNextItem.id)

  console.log(`New item IDs: ${newItemIDs}`)

  return newItemIDs
}

// Given a GitHub login, returns a bool indicating 
// whether the login is part of the docs team
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

  // Formats a date object into the required format for projects
  function formatDateForProject(date) {
    return date.getFullYear() + '-' + (date.getMonth() + 1) + '-' + date.getDate()
  }

  // Calculate the date {turnaround} business days from now (excluding weekends; not considering holidays)
function calculateDueDate(datePosted, turnaround = 2) {
  let daysUntilDue
  switch (datePosted.getDay()) {
    case 0: // Sunday
      daysUntilDue = turnaround + 1
      break
    case 6: // Saturday
      daysUntilDue = turnaround + 2
      break
    default:
      daysUntilDue = turnaround
  }
  const millisecPerDay = 24 * 60 * 60 * 1000
  const dueDate = new Date(datePosted.getTime() + millisecPerDay * daysUntilDue)
  return dueDate
}

export default { addItemsToProject, docsTeamMemberQ, findFieldID, findSingleSelectID, formatDateForProject, calculateDueDate }
