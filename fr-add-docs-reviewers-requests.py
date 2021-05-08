import requests
import os
import json
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

endpoint = 'https://api.github.com/graphql'
github_repo_id = "MDEwOlJlcG9zaXRvcnkz"
docs_reviewers_id = "MDQ6VGVhbTQzMDMxMzk="
docs_project_id = "MDc6UHJvamVjdDQ1NzI0ODI="
docs_column_id = "PC_lAPNJr_OAEXFQs4A2OFq"

#todo decide how many PRs to return

def find_open_prs_for_repo(repo_id, num_prs):

  query = """query ($repo_id: ID!, $num_prs: Int!) {
    node(id: $repo_id) {
      ... on Repository {
        pullRequests(last: $num_prs, states: OPEN) {
          nodes {
            number
            id
            title
            isDraft
            reviewRequests(first: 10) {
              nodes {
                requestedReviewer {
                  ... on Team {
                    name
                    id
                  }
                }
              }
            }
            projectCards(first: 10) {
              nodes {
                project {
                  name
                  id
                }
              }
            }
          }
        }
      }
    }
  }
  """

  variables = {
    "repo_id": github_repo_id,
    "num_prs": num_prs
  }

  response = requests.post(
    endpoint, 
    json={'query': query, 'variables': variables}, 
    headers = {'Authorization': f"bearer {os.environ['TOKEN']}"}
    )

  response.raise_for_status()

  json_response = json.loads(response.text)

  if 'errors' in json_response:
    raise RuntimeError(f'Error in GraphQL response: {json_response}')

  print(f"p-found: {json_response}")
  logger.info(f"l-found: {json_response}")
  return json_response

def add_prs_to_board(prs_to_add, column_id):
  print(f"p-adding: {prs_to_add}")
  logger.info(f"l-adding: {prs_to_add}")
  for pr_id in prs_to_add:
    logger.info(f"Attempting to add {pr_id} to board")
    print(f"Attempting to add {pr_id} to board")

    mutation = """mutation($pr_id: ID!, $column_id: ID!) {
                    addProjectCard(input:{contentId: $pr_id, projectColumnId: $column_id}) {
                      projectColumn {
                        name
                        }
                      }
    }"""

    variables = {
      "pr_id": pr_id,
      "column_id": column_id
    }

    response = requests.post(
      endpoint, 
      json={'query': mutation, 'variables': variables},
      headers = {'Authorization': f"bearer {os.environ['TOKEN']}"}
    )

    json_response = json.loads(response.text)
    if 'errors' in json_response:
      logger.info(f"l-GraphQL error when adding {pr_id}: {json_response}")
      print(f"p-GraphQL error when adding {pr_id}: {json_response}")
      # todo not throwing error, but could record error after

def filter_prs(data):

  pr_data = data['data']['node']['pullRequests']['nodes']

  prs_to_add = []

  # todo remember to put not before draft
  for pr in pr_data:
    if (
      pr['isDraft'] and
      docs_reviewers_id in [req_rev['requestedReviewer']['id'] for req_rev in pr['reviewRequests']['nodes'] if req_rev['requestedReviewer']] and
      docs_project_id not in [proj_card['project']['id'] for proj_card in pr['projectCards']['nodes']]
    ):
      prs_to_add.append(pr['id'])
  
  return prs_to_add

query_data = find_open_prs_for_repo(github_repo_id, 10)
prs_to_add = filter_prs(query_data)
add_prs_to_board(prs_to_add, docs_column_id)
