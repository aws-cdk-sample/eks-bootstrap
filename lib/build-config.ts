export interface BuildConfig {
  readonly region: string;
  readonly appName: string;
  readonly createVpc: boolean;
  readonly vpcCidr: string;
  readonly vpcId: string;
  readonly accountId: string;
  readonly env: string;
  readonly iamUser: string;
  readonly ec2SSHKey: string;
  readonly k8sVersion: string;
  readonly albVersion: string;
}