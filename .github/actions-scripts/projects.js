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


export default {
  addItemsToProject
}
