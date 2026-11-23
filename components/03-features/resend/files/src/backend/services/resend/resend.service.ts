export class ResendService {
  private readonly sender: string;
  private readonly apiKey: string;

  constructor(sender: string, apiKey: string) {
    this.sender = sender;
    this.apiKey = apiKey;
  }

  async send(to: string, subject: string, text: string, html?: string): Promise<void> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.sender, to: [to], subject, text, html }),
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error('인증 이메일 발송에 실패했습니다.');
  }
}

export function createResendService(sender: string, apiKey: string): ResendService {
  if (!sender.trim() || !apiKey.trim()) throw new Error('Resend 발송 설정을 확인해주세요.');
  return new ResendService(sender, apiKey);
}
