import * as cdk from 'aws-cdk-lib';
import { CfnOutput } from 'aws-cdk-lib';
import { AutoScalingGroup, UpdatePolicy } from 'aws-cdk-lib/aws-autoscaling';
import { IVpc, SubnetType, Vpc, InstanceType, MachineImage } from 'aws-cdk-lib/aws-ec2';
import { AlbControllerVersion, Cluster, ClusterLoggingTypes, EksOptimizedImage, EndpointAccess, KubernetesVersion, NodegroupAmiType } from 'aws-cdk-lib/aws-eks';
import { IRole, ManagedPolicy, Role, ServicePrincipal, User } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { BuildConfig } from './build-config';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class EksBootstrapStack extends cdk.Stack {
  config: BuildConfig;
  constructor(scope: Construct, id: string, config: BuildConfig, props?: cdk.StackProps,) {
    super(scope, id, props);
    this.config = config;
    // console.log("Current config: ", config);

    // 创建 VPC
    let vpc: IVpc;
    if (this.config.createVpc) {
      vpc = this.createVpc();
    } else {
      vpc = Vpc.fromLookup(this, `${this.config.appName}_vpc`, {
        region: this.config.region,
        vpcId: this.config.vpcId,
      });
    }

    // 創建一個沒有 node 節點的 cluster
    const cluster = this.createCluster(vpc);
    // 為 node 節點創建 IAM Role
    const nodeRole = this.createEKSNodeRole();
    // 添加3台 graviton 節點
    this.addNodeGroup(cluster, "system",
      [new InstanceType("c7g.large")], NodegroupAmiType.BOTTLEROCKET_ARM_64,
      { BizFun: "system", ArchType: "arm" }, this.config.ec2SSHKey, nodeRole, 3);

    this.addNodeGroup(cluster, "biz",
      [new InstanceType("c7g.large"), new InstanceType("c7g.xlarge")], NodegroupAmiType.BOTTLEROCKET_ARM_64,
      { BizFun: "biz", ArchType: "arm" }, this.config.ec2SSHKey, nodeRole);

    // 將當前 iam user 綁定為 kubeconfig 
    this.bindEksMaterUser(cluster);

    // new CfnOutput(this, "output", {
    //   value: vpc.vpcArn,
    // });

  }


  createVpc() {
    return new Vpc(this, `${this.config.appName}_vpc`, {
      cidr: this.config.vpcCidr,
      vpcName: `${this.config.appName}_vpc`,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: `${this.config.appName}_public`,
          subnetType: SubnetType.PUBLIC
        },
        // {
        //   cidrMask: 22,
        //   name: this.name + '_node',
        //   subnetType: SubnetType.PRIVATE_WITH_NAT,

        // },
        {
          cidrMask: 20,
          name: `${this.config.appName}_private`,
          subnetType: SubnetType.PRIVATE_WITH_NAT,
        }
      ]
    });
  }

  createCluster(vpc: IVpc) {
    const cluster = new Cluster(this, `${this.config.appName}_eks`, {
      clusterName: `${this.config.appName}_eks`,
      endpointAccess: EndpointAccess.PUBLIC,
      version: KubernetesVersion.of(this.config.k8sVersion),
      vpc,
      vpcSubnets: [{ subnetType: SubnetType.PRIVATE_WITH_NAT }],
      albController: {
        // version: AlbControllerVersion.V2_4_1,
        version: AlbControllerVersion.of(this.config.albVersion),
        policy: {
          "Version": "2012-10-17",
          "Statement": [
            {
              "Effect": "Allow",
              "Action": [
                "iam:CreateServiceLinkedRole"
              ],
              "Resource": "*",
              "Condition": {
                "StringEquals": {
                  "iam:AWSServiceName": "elasticloadbalancing.amazonaws.com"
                }
              }
            },
            {
              "Effect": "Allow",
              "Action": [
                "ec2:DescribeAccountAttributes",
                "ec2:DescribeAddresses",
                "ec2:DescribeAvailabilityZones",
                "ec2:DescribeInternetGateways",
                "ec2:DescribeVpcs",
                "ec2:DescribeVpcPeeringConnections",
                "ec2:DescribeSubnets",
                "ec2:DescribeSecurityGroups",
                "ec2:DescribeInstances",
                "ec2:DescribeNetworkInterfaces",
                "ec2:DescribeTags",
                "ec2:GetCoipPoolUsage",
                "ec2:DescribeCoipPools",
                "elasticloadbalancing:DescribeLoadBalancers",
                "elasticloadbalancing:DescribeLoadBalancerAttributes",
                "elasticloadbalancing:DescribeListeners",
                "elasticloadbalancing:DescribeListenerCertificates",
                "elasticloadbalancing:DescribeSSLPolicies",
                "elasticloadbalancing:DescribeRules",
                "elasticloadbalancing:DescribeTargetGroups",
                "elasticloadbalancing:DescribeTargetGroupAttributes",
                "elasticloadbalancing:DescribeTargetHealth",
                "elasticloadbalancing:DescribeTags"
              ],
              "Resource": "*"
            },
            {
              "Effect": "Allow",
              "Action": [
                "cognito-idp:DescribeUserPoolClient",
                "acm:ListCertificates",
                "acm:DescribeCertificate",
                "iam:ListServerCertificates",
                "iam:GetServerCertificate",
                "waf-regional:GetWebACL",
                "waf-regional:GetWebACLForResource",
                "waf-regional:AssociateWebACL",
                "waf-regional:DisassociateWebACL",
                "wafv2:GetWebACL",
                "wafv2:GetWebACLForResource",
                "wafv2:AssociateWebACL",
                "wafv2:DisassociateWebACL",
                "shield:GetSubscriptionState",
                "shield:DescribeProtection",
                "shield:CreateProtection",
                "shield:DeleteProtection"
              ],
              "Resource": "*"
            },
            {
              "Effect": "Allow",
              "Action": [
                "ec2:AuthorizeSecurityGroupIngress",
                "ec2:RevokeSecurityGroupIngress"
              ],
              "Resource": "*"
            },
            {
              "Effect": "Allow",
              "Action": [
                "ec2:CreateSecurityGroup"
              ],
              "Resource": "*"
            },
            {
              "Effect": "Allow",
              "Action": [
                "ec2:CreateTags"
              ],
              "Resource": "arn:aws:ec2:*:*:security-group/*",
              "Condition": {
                "StringEquals": {
                  "ec2:CreateAction": "CreateSecurityGroup"
                },
                "Null": {
                  "aws:RequestTag/elbv2.k8s.aws/cluster": "false"
                }
              }
            },
            {
              "Effect": "Allow",
              "Action": [
                "ec2:CreateTags",
                "ec2:DeleteTags"
              ],
              "Resource": "arn:aws:ec2:*:*:security-group/*",
              "Condition": {
                "Null": {
                  "aws:RequestTag/elbv2.k8s.aws/cluster": "true",
                  "aws:ResourceTag/elbv2.k8s.aws/cluster": "false"
                }
              }
            },
            {
              "Effect": "Allow",
              "Action": [
                "ec2:AuthorizeSecurityGroupIngress",
                "ec2:RevokeSecurityGroupIngress",
                "ec2:DeleteSecurityGroup"
              ],
              "Resource": "*",
              "Condition": {
                "Null": {
                  "aws:ResourceTag/elbv2.k8s.aws/cluster": "false"
                }
              }
            },
            {
              "Effect": "Allow",
              "Action": [
                "elasticloadbalancing:CreateLoadBalancer",
                "elasticloadbalancing:CreateTargetGroup"
              ],
              "Resource": "*",
              "Condition": {
                "Null": {
                  "aws:RequestTag/elbv2.k8s.aws/cluster": "false"
                }
              }
            },
            {
              "Effect": "Allow",
              "Action": [
                "elasticloadbalancing:CreateListener",
                "elasticloadbalancing:DeleteListener",
                "elasticloadbalancing:CreateRule",
                "elasticloadbalancing:DeleteRule"
              ],
              "Resource": "*"
            },
            {
              "Effect": "Allow",
              "Action": [
                "elasticloadbalancing:AddTags",
                "elasticloadbalancing:RemoveTags"
              ],
              "Resource": [
                "arn:aws:elasticloadbalancing:*:*:targetgroup/*/*",
                "arn:aws:elasticloadbalancing:*:*:loadbalancer/net/*/*",
                "arn:aws:elasticloadbalancing:*:*:loadbalancer/app/*/*"
              ],
              "Condition": {
                "Null": {
                  "aws:RequestTag/elbv2.k8s.aws/cluster": "true",
                  "aws:ResourceTag/elbv2.k8s.aws/cluster": "false"
                }
              }
            },
            {
              "Effect": "Allow",
              "Action": [
                "elasticloadbalancing:AddTags",
                "elasticloadbalancing:RemoveTags"
              ],
              "Resource": [
                "arn:aws:elasticloadbalancing:*:*:listener/net/*/*/*",
                "arn:aws:elasticloadbalancing:*:*:listener/app/*/*/*",
                "arn:aws:elasticloadbalancing:*:*:listener-rule/net/*/*/*",
                "arn:aws:elasticloadbalancing:*:*:listener-rule/app/*/*/*"
              ]
            },
            {
              "Effect": "Allow",
              "Action": [
                "elasticloadbalancing:ModifyLoadBalancerAttributes",
                "elasticloadbalancing:SetIpAddressType",
                "elasticloadbalancing:SetSecurityGroups",
                "elasticloadbalancing:SetSubnets",
                "elasticloadbalancing:DeleteLoadBalancer",
                "elasticloadbalancing:ModifyTargetGroup",
                "elasticloadbalancing:ModifyTargetGroupAttributes",
                "elasticloadbalancing:DeleteTargetGroup"
              ],
              "Resource": "*",
              "Condition": {
                "Null": {
                  "aws:ResourceTag/elbv2.k8s.aws/cluster": "false"
                }
              }
            },
            {
              "Effect": "Allow",
              "Action": [
                "elasticloadbalancing:RegisterTargets",
                "elasticloadbalancing:DeregisterTargets"
              ],
              "Resource": "arn:aws:elasticloadbalancing:*:*:targetgroup/*/*"
            },
            {
              "Effect": "Allow",
              "Action": [
                "elasticloadbalancing:SetWebAcl",
                "elasticloadbalancing:ModifyListener",
                "elasticloadbalancing:AddListenerCertificates",
                "elasticloadbalancing:RemoveListenerCertificates",
                "elasticloadbalancing:ModifyRule"
              ],
              "Resource": "*"
            }
          ]
        }
      },

      clusterLogging: [
        ClusterLoggingTypes.API,
        ClusterLoggingTypes.AUTHENTICATOR,
        ClusterLoggingTypes.SCHEDULER,
        ClusterLoggingTypes.CONTROLLER_MANAGER,
        ClusterLoggingTypes.AUDIT
      ],
      defaultCapacity: 0
    });
    return cluster;
  }

  addNodeGroup(cluster: Cluster, groupName: string,
    instanceTypes: InstanceType[], amiType: NodegroupAmiType,
    tags: { [name: string]: string }, sshKeyName: string,
    nodeRole: IRole, minSize?: number) {
    minSize = minSize || 0;
    cluster.addNodegroupCapacity(groupName, {
      instanceTypes,
      amiType,
      minSize,
      tags,
      labels: tags,
      maxSize: 100,
      diskSize: 100,
      nodeRole,
      // subnets: { subnetGroupName: `${this.config.appName}_private` },
      subnets: {
        subnetType: SubnetType.PRIVATE_WITH_NAT,
      },
      remoteAccess: {
        sshKeyName: sshKeyName
      },
    });
  }

  // addAutoscalingNG(vpc:IVpc, role:IRole){

  //   const onDemandASG = new AutoScalingGroup(this, `${this.config.appName}_asg_arm`, {
  //     vpc,
  //     role,
  //     minCapacity: 0,
  //     maxCapacity: 10,
  //     instanceType: new InstanceType('t3.medium'),
  //     machineImage: MachineImage.b,
  //     updatePolicy: UpdatePolicy.rollingUpdate()
  //     });
  // }

  createEKSNodeRole() {
    const role = new Role(this, `${this.config.appName}_eks_node`, {
      roleName: `${this.config.appName}_eks_node`,
      assumedBy: new ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName("AmazonEKSWorkerNodePolicy"),
        ManagedPolicy.fromAwsManagedPolicyName("AmazonEC2ContainerRegistryReadOnly"),
        ManagedPolicy.fromAwsManagedPolicyName("AmazonEKS_CNI_Policy"),
      ]
    });
    return role;
  }


  bindEksMaterUser(cluster: Cluster) {
    const adminUser = User.fromUserName(this, 'adminUser', this.config.iamUser);
    cluster.awsAuth.addUserMapping(adminUser, { groups: ['system:masters'] });
  }

}
