export function startPlaybackWithSupplementaryAudio(
  startTimeline: () => void,
  startAudio?: () => void | Promise<void>,
  onAudioError: (error: unknown) => void = (error) => console.warn("Supplementary audio could not be started.", error),
) {
  startTimeline();
  if (startAudio) {
    void Promise.resolve().then(startAudio).catch(onAudioError);
  }
}
