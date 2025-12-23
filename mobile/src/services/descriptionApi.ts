import type { DescribeRequest, DescribeResponse } from '../types/description';
import { http } from './http';

export async function describeEnvironment(payload: DescribeRequest): Promise<DescribeResponse> {
  return http<DescribeResponse>({
    method: 'POST',
    path: '/describe',
    body: payload,
    timeoutMs: 120_000,
  });
}
