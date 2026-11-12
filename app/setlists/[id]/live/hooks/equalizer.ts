export function clearQueuedMidiOutputs(outputs: Array<{ state: string }>): unknown[] {
  const errors: unknown[] = [];
  for (const output of outputs) {
    if (output.state === "disconnected") continue;
    try {
      if ("clear" in output && typeof output.clear === "function") output.clear();
    } catch (error) {
      errors.push(error);
    }
  }
  return errors;
}

export function clearEqualizerOutputs(outputs: Array<{ state: string; send(data: number[]): void }>): unknown[] {
  const errors: unknown[] = [];
  for (const output of outputs) {
    if (output.state === "disconnected") continue;
    for (let note = 0; note < 32; note++) {
      try {
        output.send([0x90, note, 0]);
      } catch (error) {
        errors.push(error);
      }
    }
  }
  return errors;
}
