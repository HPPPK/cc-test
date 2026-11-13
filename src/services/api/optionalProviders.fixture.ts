import type { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk'
import type { AnthropicVertex } from '@anthropic-ai/vertex-sdk'
const options: ConstructorParameters<typeof AnthropicBedrock>[0] = { awsRegion: 'us-east-1', skipAuth: true }
// @ts-expect-error region configuration must be text
const invalid: ConstructorParameters<typeof AnthropicBedrock>[0] = { awsRegion: 123 }
declare const bedrock: AnthropicBedrock
declare const vertex: AnthropicVertex
// @ts-expect-error Bedrock does not implement token counting in the upstream 0.80 adapter
 type UnsupportedTokenCount = typeof bedrock.beta.messages.countTokens
// @ts-expect-error Vertex does not implement the Batch API
 type UnsupportedBatch = typeof vertex.messages.batches
void [options, invalid]
