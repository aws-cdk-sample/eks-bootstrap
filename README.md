# Create AWS EKS using CDK(Typescript)

This script will create the following resources:

- A VPC (if createVpc is true)

- 2 Subnets: one is PRIVATE_WITH_NAT, one is Public.

- An eks cluster without node.

- 2 node groups: one has 3 nodes, one has zero node.

- AlbController.

- Many other resources created implicitly.

## Prerequisite

- [Setup your environment for aws CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-configure.html)

- [Install CDK](https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html)

- This sample use arm architecture (c7g.large, c7g.xlarge) instances. Please confirm the resources requirements in your AZ.

- Os is BOTTLEROCKET_ARM_64.

- Please feel free to modify the source code.

## Steps

### 1. Setup EC2 ssh key pair and iam user policy

[Create your ssh key pair.](https://console.aws.amazon.com/ec2/v2/home#KeyPairs:)

[Setup IAM user's permissions.](https://docs.aws.amazon.com/eks/latest/userguide/service_IAM_role.html)

### 2. Config

File: cdk.context.json

```json
{
  "dev": {
    "accountId": "00000000000",
    "region": "us-east-1",
    "env": "dev",
    "appName": "SampleApp",
    "createVpc": false,
    "vpcCidr": "10.0.0.0/16",
    "vpcId": "vpc-0xxxxxxxx",
    "ec2SSHKey": "your-ec2-key",
    "iamUser": "your-iam-user",
    "k8sVersion": "1.23",
    "albVersion": "v2.4.3"
  },
}
```

- appName: IaaS resources will be named as "SampleAppxxxxx".

- createVpc: true will create a new vpc with 'vpcCidr', false will choose the existing vpc of 'vpcId'.

- k8sVersion: K8S version: <https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html>

- albVersion: ALB controller version: <https://github.com/kubernetes-sigs/aws-load-balancer-controller/releases>

### 3. Run cdk script

Deploy

```bash
cdk deploy -c env=dev EksBootstrapStack
```

Destory

```bash
cdk destory -c env=dev EksBootstrapStack
```

- replace `dev` to your key in cdk.context.json.

### 4. Create kubeconfig for local kubectl

```bash
aws eks update-kubeconfig --region <your-region> --name <your-appName>_eks 
```
