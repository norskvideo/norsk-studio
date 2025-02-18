import type Registration from "@norskvideo/norsk-studio/lib/extension/registration";
import AutoCmaf from '../output.autoCmaf/info';

export default function(R: Registration): ReturnType<typeof AutoCmaf> {
  const autoCmaf = AutoCmaf(R);

  const { drmProvider: _, ...NoCrypto } = autoCmaf.configForm.form;

  return {
    ...autoCmaf,
    identifier: 'output.autoHls',
    name: "Auto HLS(TS)",
    description: "This component handles the creation of HLS/TS outputs from multiple video and audio streams.",
    configForm: {
      ...autoCmaf.configForm,
      form: { ...NoCrypto }
    }
  }
}

