// Import todocs
import { Octokit } from "octokit";

// Get the values of environment variables that were set by the GitHub Actions workflow.
const TOKEN = process.env.TOKEN;
const REPO_OWNER = process.env.REPO_OWNER;
const REPO_NAME = process.env.REPO_NAME;
const HOOK_ID = process.env.HOOK_ID;

// If `LAST_WEBHOOK_REDELIVERY_TIME` was not defined, use the current time minus 24 hours
const LAST_WEBHOOK_REDELIVERY_TIME = process.env.LAST_WEBHOOK_REDELIVERY_TIME || Date.now() - (24 * 60 * 60 * 1000);

// Create an instance of `Octokit` using the token values that were set in the GitHub Actions workflow.
const octokit = new Octokit({ 
  auth: TOKEN,
});

async function checkAndRedeliverWebhooks() {
  try {
    // Get the webhook deliveries that were delivered after `LAST_WEBHOOK_REDELIVERY_TIME`
    const deliveries = await fetchWebhookDeliveriesSince(LAST_WEBHOOK_REDELIVERY_TIME);

    // Get any deliveries that failed and that have not been successfully redelivered.
    // Use the `guid`, which is constant across redeliveries of the same delivery, to get rid of any duplicate failed deliveries.

    // Consolidate deliveries that have the same `guid`. The `guid` is constant across redeliveries of the same delivery.
    // This will help prevent duplicate redeliveries if a delivery has failed multiple times or if a failed delivery has been successfully redelivered.
    let deliveriesByGuid = {};
    for (const delivery of deliveries) {
      deliveriesByGuid[delivery.guid]
        ? deliveriesByGuid[delivery.guid].push(delivery)
        : (deliveriesByGuid[delivery.guid] = [delivery]);
    }

    // Get any deliveries that have never been successfully delivered within the time frame.
    // This will prevent redelivery of failed deliveries that have been successfully redelivered by a previous run of this script or manually.
    let failedDeliveryIDs = [];
    for (const guid in deliveriesByGuid) {
      const deliveries = deliveriesByGuid[guid];
      const anySucceeded = deliveries.some(
        (delivery) => delivery.status === "OK"
      );
      if (!anySucceeded) {
        failedDeliveryIDs.push(deliveries[0].id);
      }
    }

    // Redeliver any failed deliveries.
    for (const id of failedDeliveryIDs) {
      await redeliverWebhook(id);
    }

    // todocs update the last run var

    // Log the number of redeliveries.
    console.log(
      `Redelivered ${
        failedDeliveryIDs.length
      } failed webhook deliveries out of ${
        deliveries.length
      } total deliveries since ${Date(LAST_WEBHOOK_REDELIVERY_TIME)}.`
    );
  } catch (error) {
    if (error.response) {
      console.error(
        `Failed to check and redeliver webhooks: ${error.response.data.message}`
      );
    }
    console.error(error);
  }
}

// This function will fetch all of the webhook deliveries that were delivered since `LAST_WEBHOOK_REDELIVERY_TIME`. 
// It uses the `octokit.paginate.iterator()` method to iterate through paginated results. For more information, see "[AUTOTITLE](/rest/guides/scripting-with-the-rest-api-and-javascript#making-paginated-requests)."
// If you are redelivering an organization or GitHub App webhook, update this function to use the appropriate endpoint and variables.
async function fetchWebhookDeliveriesSince(LAST_WEBHOOK_REDELIVERY_TIME) {
  const iterator = octokit.paginate.iterator(
    "GET /repos/{owner}/{repo}/hooks/{hook_id}/deliveries",
    {
      owner: REPO_OWNER,
      repo: REPO_NAME,
      hook_id: HOOK_ID,
      per_page: 100,
      headers: {
        "x-github-api-version": "2022-11-28",
      },
    }
  );

  const deliveries = [];
  
  for await (const { data } of iterator) {
    const oldestDeliveryTimestamp = new Date(
      data[data.length - 1].delivered_at
    ).getTime();

    if (oldestDeliveryTimestamp < LAST_WEBHOOK_REDELIVERY_TIME) {
      // If this page includes deliveries that occurred before `LAST_WEBHOOK_REDELIVERY_TIME`,
      // store only the delivery IDs that occurred after `LAST_WEBHOOK_REDELIVERY_TIME` and then break.
      for (const delivery of data) {
        if (new Date(delivery.delivered_at).getTime() > LAST_WEBHOOK_REDELIVERY_TIME) {
          deliveries.push(delivery);
        } else {
          break;
        }
      }
      break;
    } else {
      // Otherwise, store all of the delivery IDs from this page
      deliveries.push(...data);
    }
  }

  return deliveries;
}

// This function will redeliver a failed webhook delivery.
// If you are redelivering an organization or GitHub App webhook, update this function to use the appropriate endpoint and variables.
async function redeliverWebhook(deliveryId) {
  await octokit.request("POST /repos/{owner}/{repo}/hooks/{hook_id}/deliveries/{delivery_id}/attempts", {
    owner: REPO_OWNER,
    repo: REPO_NAME,
    hook_id: HOOK_ID,
    delivery_id: deliveryId,
  });
}

// todocs update run time
console.log('todo')
console.log(process.env.TOKEN[0]);
console.log('???')

await checkAndRedeliverWebhooks();
