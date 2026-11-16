# Image generation resets during long silent responses

## Evidence (2026-11-11)

The configured provider was the official OpenAI API with `gpt-image-2`.
Catalog preflight succeeded. Prompt-less authenticated requests returned the
expected missing-prompt error. Original `stream: true, partial_images: 0`
requests reset before headers after about 86 seconds; explicitly selecting the
local HTTP proxy produced the same outcome. One preview returned HTTP 200 but
the body reset before completion. A non-stream request reset after 91 seconds.

With three previews, Bun and curl both received previews and the final
`image_generation.completed` event (126 and 131 seconds). The revised production
service, exercised through the local images API, generated and saved a valid
1024 x 1024 PNG in about 105 seconds.

## Interpretation and limits

Long silent waits were the reproducible failure condition on this network.
Do not infer that every network has the same timeout or that a specific proxy
or OpenAI component was conclusively identified as the resetting hop. Switching
clients or merely selecting the system proxy did not explain the outcome.

## Recovery

Request three progressive previews, consume SSE incrementally, and finish on
`image_generation.completed` instead of waiting for socket EOF. Never deliver
`partial_image_b64` as a finished image. Handle transport exceptions before
headers and during body reads, returning safe error codes without raw exception
messages. Do not automatically retry billable generation on ambiguous resets.

## Regression proof

`src/server/services/imageGenerationService.test.ts` checks request shape,
fragmented SSE, completion without EOF, preview-only EOF, stream errors,
connection resets, timeouts, and credential non-disclosure. Existing JSON image
responses remain supported. A catalog preflight only proves model visibility.
