# Model access recovery

The owner reports direct Meta key creation is blocked by: “Your account is restricted. We weren't able to place a temporary hold on your payment method. Update it to keep making requests.” Two cards have been tried. This report establishes the blocked operation; it does not establish the underlying bank or platform cause.

## Direct Meta resolution

Meta's [payment-failure guidance](https://dev.meta.ai/help/billing/payment-failure) directs persistent card failures to the financial institution. Ask the issuer whether it received the authorization attempt and, if declined, its exact reason. Do not assume promotional credits clear the payment verification requirement.

The team admin can open a [Model API support ticket](https://dev.meta.ai/support). Include the team name, admin account email, selected hackathon status, visible promotional credit balance, exact error, timestamps, and the fact that two methods failed. Include relevant invoice or billing-period information if one exists. Request review of the authorization restriction and confirmation that hackathon credit is attached to the intended team/project. No card number/CVV is needed in the description. The organizer Discord support channel is a separate escalation option for event access. No messages have been sent on the owner's behalf.

Suggested support text:

> I am a selected Meta Global AI Developer Hackathon participant with promotional API credits. API-key creation is blocked by “Your account is restricted. We weren't able to place a temporary hold on your payment method. Update it to keep making requests.” I have tried two cards and remain blocked. Please review the payment authorization restriction and confirm that my hackathon credits are attached to the correct team/project. Is an event-credit activation or supported alternative available while billing is reviewed?

## Product path available independently

The [official event page](https://events.cerebralvalley.ai/e/meta-ai-developer-hackathon) lists partner credits for Meta open-weight models. [Baseten](https://www.baseten.co/library/muse-spark-open/) hosts Meta's Muse Spark Open with image input through a separate provider account. This is an event-supported hosting route; it does not unlock or change the restricted direct Meta account.

The adapter accepts a server-only `BASETEN_API_KEY` and uses `meta-models/muse-spark-open`. The provider key and credited account still need a successful live trial. Muse Spark Open is a different model from Muse Wonder, and Baseten documents no enforced JSON schema/JSON mode support for it. Requests therefore include the output schema in the prompt and validate every returned object before applying it. Invalid output produces an explicit error; there is no stock-scene substitution and no automatic switch to another provider.

SAM segmentation is not supplied by this adapter. It remains a separate extraction integration to verify. A Baseten key can unblock live scene interpretation trials but does not by itself complete the original drawing-to-play milestone.
