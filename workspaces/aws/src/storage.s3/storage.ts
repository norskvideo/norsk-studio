import { GetBucketLocationCommand, GetObjectCommand, ListObjectsCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { BaseConfig } from "@norskvideo/norsk-studio/lib/extension/client-types";
import { StorageComponentDefinition } from "@norskvideo/norsk-studio/lib/extension/runtime-types"
import { debuglog, errorlog, warninglog } from "@norskvideo/norsk-studio/lib/server/logging";
import { promises as fs } from "fs";
import * as path from "path";

export type S3Config = {
  id: string,
  displayName: string,
  bucket: string,
  prefix: string
}

function findConfig(configs: BaseConfig[]): S3Config | undefined {
  const config = configs.find((c) => c.id == "s3");
  return (config == undefined) ? undefined : config as S3Config;
}

export default class S3Storage implements StorageComponentDefinition<S3Config> {
  async preScanDirectory(configs: BaseConfig, localDir: string): Promise<boolean> {
    debuglog("s3:preScanDirectory", { configs });
    const config = findConfig(configs as unknown as BaseConfig[]);

    // There is no config for this type, take no action
    if (config == undefined) { return true; }

    const files = await fs.readdir(localDir);
    if (files.length == 0) {
      try {
        const bucketLocationCommand = new GetBucketLocationCommand({ "Bucket": config.bucket })
        const bucketLocationClient = new S3Client({ "region": "us-east-1" })
        const result = await bucketLocationClient.send(bucketLocationCommand);
        const bucketLocation = result.LocationConstraint ?? undefined;

        if (bucketLocation != undefined) {
          const client = new S3Client({ "region": bucketLocation });

          const command = new ListObjectsCommand({
            "Bucket": config.bucket,
            "Prefix": config.prefix
          });

          const response = await client.send(command);
          const files = response.Contents?.map((e) => (e.Key ?? "").replace(response.Prefix ?? "", "").substring(1)) ?? [];

          for (const filename of files) {
            const localpath = `${localDir}/${filename}`;
            const documentKey = `${config.prefix}/${filename}`;

            debuglog("Downloading file", { localpath, documentKey, filename });

            const getObject = new GetObjectCommand({
              "Bucket": config.bucket,
              "Key": documentKey
            });
            const getResult = await client.send(getObject);
            const fileData = await getResult?.Body?.transformToString("utf8");
            if (fileData != undefined) {
              await fs.writeFile(localpath, fileData, "utf8");
            }
          }

          debuglog("Finished downloading files");

          return true;

        } else {
          errorlog("Couldn't get region for bucket", { bucket: config.bucket });
          return false;
        }
      }
      catch (err) {
        errorlog("Exception when copying directory", { bucket: config.bucket, prefix: config.prefix, err });
        return Promise.resolve(false);
      }
    }
    else {
      warninglog("Directory not empty, skipping sync", { localDir });
      return true;
    }
  }

  async preLoadDocument(configs: BaseConfig, doc: string): Promise<boolean> {

    const filename = path.basename(doc);

    debuglog("s3:preLoadDocument", { configs });
    const config = findConfig(configs as unknown as BaseConfig[]);

    // There is no config for this type, take no action
    if (config == undefined) { return true; }


    try {
      const bucketLocationCommand = new GetBucketLocationCommand({ "Bucket": config.bucket })
      const bucketLocationClient = new S3Client({ "region": "us-east-1" })
      const result = await bucketLocationClient.send(bucketLocationCommand);
      const bucketLocation = result.LocationConstraint ?? undefined;

      if (bucketLocation != undefined) {
        const client = new S3Client({ "region": bucketLocation });
        const documentKey = `${config.prefix}/${filename}`;

        const command = new GetObjectCommand({
          "Bucket": config.bucket,
          "Key": documentKey
        });

        const data = await client.send(command);
        if (data != undefined && data.Body != undefined) {
          const fileData = await data?.Body?.transformToString("utf8");
          if (fileData != undefined) {
            const _ = await fs.writeFile(doc, fileData, "utf8");
            return true;
          } else {
            errorlog("Failed to get string from stream", { data });
            return false;
          }
        } else {
          errorlog("Failed to get object from s3", { data });
          return false;
        }
      } else {
        errorlog("Couldn't get region for bucket", { bucket: config.bucket });
        return false;
      }
    }
    catch (err) {
      errorlog("Exception when reading requested file", { bucket: config.bucket, doc, filename, err });
      throw err;
    }
  }

  async postSaveDocument(configs: BaseConfig, doc: string) {
    const filename = path.basename(doc);

    debuglog("s3:postSaveDocument", { configs });
    const config = findConfig(configs as unknown as BaseConfig[]);

    // There is no config for this type, take no action
    if (config == undefined) { return true; }

    debuglog("s3:postSaveDocument");
    try {
      const bucketLocationCommand = new GetBucketLocationCommand({ "Bucket": config.bucket })
      const bucketLocationClient = new S3Client({ "region": "us-east-1" })
      const result = await bucketLocationClient.send(bucketLocationCommand);
      const bucketLocation = result.LocationConstraint ?? undefined;

      debuglog("s3:postSaveDocument", bucketLocation);

      if (bucketLocation != undefined) {
        const client = new S3Client({ "region": bucketLocation });
        const documentKey = `${config.prefix}/${filename}`;
        const yaml = await fs.readFile(doc, "utf8");

        const command = new PutObjectCommand({
          "Bucket": config.bucket,
          "Key": documentKey,
          "Body": yaml
        });

        debuglog("Save command", command);
        const _data = await client.send(command);
        return true;
      } else {
        errorlog("Couldn't get region for bucket", { bucket: config.bucket });
        return false;
      }
    }
    catch (err) {
      errorlog("Exception when updating requested file", { bucket: config.bucket, doc, filename, err });
      return Promise.resolve(false);
    }
  }

}

