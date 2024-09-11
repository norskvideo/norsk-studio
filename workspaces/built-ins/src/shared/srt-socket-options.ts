import type { ConfigForm, Validation } from "@norskvideo/norsk-studio/lib/extension/client-types";
import type { SocketOptions } from "./srt-types";

const result = ({ Z }: Validation): ConfigForm<SocketOptions> => ({
  receiveLatency: {
    help: "The latency value in the receiving direction of the socket (SRTO_RCVLATENCY)",
    hint: {
      type: "numeric", optional: true, validation: Z.optional(Z.number())
    },
  },
  peerLatency: {
    help: "The latency value provided by the sender side as a minimum value for the receiver (SRTO_PEERLATENCY)",
    hint: {
      type: "numeric", optional: true, validation: Z.optional(Z.number())
    }
  },
  inputBandwidth: {
    help: "Input bandwidth (SRTO_INPUTBW)",
    hint: {
      type: "numeric", optional: true, validation: Z.optional(Z.number())
    }
  },
  overheadBandwidth: {
    help: "Overhead bandwidth (SRTO_OHEADBW)",
    hint: {
      type: "numeric", optional: true, validation: Z.optional(Z.number())
    }
  },
  maxBandwidth: {
    help: "Max bandwidth (SRTO_MAXBW)",
    hint: {
      type: "numeric", optional: true, validation: Z.optional(Z.number())
    }
  },
}
);

export default result;
