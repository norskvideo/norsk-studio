import type Registration from "@norskvideo/norsk-studio/lib/extension/registration"
import type { FileMp4InputSettings } from "./runtime"

export default function({
  defineComponent,
  Av }: Registration) {
  return defineComponent<FileMp4InputSettings>(
    {
      identifier: 'input.fileMp4',
      category: 'input',
      name: "MP4 File ingest",
      description: "This component reads from a local MP4 file.",
      subscription: {
        accepts: undefined,
        produces: {
          type: "single-stream",
          media: Av
        }
      },
      display: (desc) => {
        return {
          fileName: desc.config.fileName,
          startTime: desc.config.startTime === undefined ? "0" : desc.config.startTime.toString(),
        }
      },
      configForm: {
        form: {
          fileName: { help: "The local filename", hint: { type: 'text', defaultValue: '/Users/steve/dev/media_samples/video/football.mp4'} },
          startTime: { help: "The time (in seconds) to start playing from", hint: { type: 'numeric', defaultValue: 510} },
        }
      }
    });
}

