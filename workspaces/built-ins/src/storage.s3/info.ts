import type Registration from "@norskvideo/norsk-studio/lib/extension/registration";


export default function (R: Registration) {
  const {
    defineStorage,
  } = R;

  return defineStorage({
    identifier: "s3",
    name: "s3",
  });
}