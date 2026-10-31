# Model access recovery

The owner reports direct Meta key creation is blocked by: “Your account is restricted. We weren't able to place a temporary hold on your payment method. Update it to keep making requests.” Two cards have been tried. This report establishes the blocked operation; it does not establish the underlying bank or platform cause.

## Direct Meta resolution

Meta's [payment-failure guidance](https://dev.meta.ai/help/billing/payment-failure) directs persistent card failures to the financial institution. Ask the issuer whether it received the authorization attempt and, if declined, its exact reason. Do not assume promotional credits clear the payment verification requirement.

The team admin can open a [Model API support ticket](https://dev.meta.ai/support). Include the team name, admin account email, selected hackathon status, visible promotional credit balance, exact error, timestamps, and the fact that two methods failed. Include relevant invoice or billing-period information if one exists. Request review of the authorization restriction and confirmation that hackathon credit is attached to the intended team/project. No card number/CVV is needed in the description. The organizer Discord support channel is a separate escalation option for event access. No messages have been sent on the owner's behalf.

Suggested support text:

> I am a selected Meta Global AI Developer Hackathon participant with promotional API credits. API-key creation is blocked by “Your account is restricted. We weren't able to place a temporary hold on your payment method. Update it to keep making requests.” I have tried two cards and remain blocked. Please review the payment authorization restriction and confirm that my hackathon credits are attached to the correct team/project. Is an event-credit activation or supported alternative available while billing is reviewed?

## Product path available independently

The [official event page](https://events.cerebralvalley.ai/e/meta-ai-developer-hackathon) lists partner credits for Meta open-weight models. [Baseten](https://www.baseten.co/library/muse-spark-open/) hosts Meta's Muse Spark Open with image input through a separate provider account. This is an event-supported hosting route; it does not unlock or change the restricted direct Meta account.

The adapter accepts a server-only `BASETEN_API_KEY` and uses `meta-models/muse-spark-open`. The authenticated account returned HTTP 403 in image and minimal text trials; it is not the active provider. Muse Spark Open is a different model from Muse Wonder, and Baseten documents no enforced JSON schema/JSON mode support for it. Requests therefore include the output schema in the prompt and validate every returned object before applying it. Invalid output produces an explicit error; there is no stock-scene substitution and no automatic switch to another provider.

SAM segmentation is a separate implemented direct-Meta integration; its live inference remains unverified. A Baseten key can unblock live scene interpretation trials but does not by itself complete the original drawing-to-play milestone.

## Credited options checked on 2026-10-31

- **Baseten:** the existing adapter calls Meta Muse Spark Open, with server-only `BASETEN_API_KEY` and explicit `MODEL_PROVIDER=baseten`.
- **Fireworks AI:** the new adapter calls `https://api.fireworks.ai/inference/v1/chat/completions`, model `accounts/fireworks/models/muse-spark-open`, with server-only `FIREWORKS_API_KEY` and explicit `MODEL_PROVIDER=fireworks`. Its model name is restricted to this Meta family. It uses schema instructions plus local response validation; real image requests now succeed. Five distinct drawing inputs were checked: four passed placement validation and one was rejected for an empty crop. This does not establish general recognition or route correctness. Fireworks’ model page describes a limited-preview period, so having credits alone does not prove current account access.
- **Modal:** [the official model library](https://modal.com/library/meta/muse-spark-open) documents a pay-per-token Shared Endpoint for Muse Spark Open. It needs Modal endpoint/account setup and verification that the hackathon credit applies to this usage. The Shared Endpoint is not integrated. A separate private SAM 2.1 worker trial hit a GPU payment-method requirement; a CPU deployment did not produce a successful result and was stopped. No Modal path is active in the product.
- **Muse Code:** local CLI version 1.4.14 is installed. The read-only usage command returned no allowance data; this does not establish logged-in inference access or a remaining balance. It is a development tool, and is not being used to route production drawing requests through a terminal agent.

[Meta’s hosted-provider guide](https://dev.meta.ai/docs/muse-spark-open/deploy), [Fireworks’ model page](https://fireworks.ai/models/fireworks/muse-spark-open), [Fireworks’ API reference](https://docs.fireworks.ai/api-reference/post-chatcompletions) and [Modal’s announcement](https://modal.com/blog/meta-muse-spark-open-now-available-on-modal) were checked. All three providers are credited options reported by the owner; their actual balances were not inspected. The owner’s Fireworks key is active server-side. Baseten and Fireworks keys stay in the external `~/.env`; Modal credentials stay in the external profile file. Only an allowlist of three model provider keys is read. No keys are copied into the repository, browser, build snapshot or documentation. Provider balances were not inspected.
