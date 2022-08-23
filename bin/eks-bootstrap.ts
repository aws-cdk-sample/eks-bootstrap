#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { EksBootstrapStack } from '../lib/eks-bootstrap-stack';
import { BuildConfig } from '../lib/build-config';
import { CfnOutput, Tags } from 'aws-cdk-lib';

const app = new cdk.App();

function getConfig() {
  let env = app.node.tryGetContext("env");
  if (!env) {
    // new CfnOutput(app, "Error", {
    //   "value": `env required, use -c refer env.
    //   ------
    //   cdk -c env=dev ...
    //   ------
    //   `
    // });

    console.error(`Context parameter 'env' is required, use -c:

cdk -c env=dev ...

    `);

    process.exit();

  }

  let config = app.node.tryGetContext(env);
  if (!config) {
    throw new Error("没有找到此配置节点，请检查根目录 cdk.context.json 文件");
  }

  let buildConfig: BuildConfig = {
    region: config["region"],
    vpcId: config["vpcId"],
    createVpc: config["createVpc"],
    appName: config["appName"],
    vpcCidr: config["vpcCidr"],
    accountId: config["accountId"],
    env: config["env"],
    iamUser: config["iamUser"],
    ec2SSHKey: config["ec2SSHKey"],
    k8sVersion: config["k8sVersion"] || "1.23",
    albVersion: config["albVersion"]|| "2.4.1"
  }
  return buildConfig;
}

let cParams: BuildConfig = getConfig();

Tags.of(app).add("App", cParams.appName);
Tags.of(app).add("Environment", cParams.env);


new EksBootstrapStack(app, 'EksBootstrapStack', cParams, {
  env: {
    region: cParams["region"],
    account: cParams["accountId"],
  }

});