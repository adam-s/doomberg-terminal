/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { StackFrame } from '../../protocol/channels';

export type SerializedStackFrame = [number, number, number, string];
export type SerializedStack = [number, SerializedStackFrame[]];

export type SerializedClientSideCallMetadata = {
  files: string[];
  stacks: SerializedStack[];
};

export function parseClientSideCallMetadata(data: SerializedClientSideCallMetadata): Map<string, StackFrame[]> {
  const result = new Map<string, StackFrame[]>();
  const { files, stacks } = data;
  for (const s of stacks) {
    const [id, ff] = s;
    result.set(
      `call@${id}`,
      ff.map(f => ({ file: files[f[0]], line: f[1], column: f[2], function: f[3] })),
    );
  }
  return result;
}
