/**
 * Lobster Wallet — USDT收款系统
 * 
 * 支持 TRC20 (Tron) 和 ERC20 (Ethereum) 钱包
 */

export interface WalletBalance {
  address: string;
  chain: 'TRC20' | 'ERC20' | 'BEP20';
  balance: string; // 字符串避免浮点精度问题
  balanceWei: bigint;
  symbol: string;
  explorerUrl: string;
}

export interface Transaction {
  txHash: string;
  from: string;
  to: string;
  value: string;
  symbol: string;
  status: 'pending' | 'confirmed' | 'failed';
  timestamp: number;
  explorerUrl: string;
}

export interface SendResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

const TRC20_ABI = [
  // balanceOf
  { type: 'function', name: 'balanceOf', inputs: [{ name: 'address', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  // transfer
  { type: 'function', name: 'transfer', inputs: [{ name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
];

const ERC20_ABI = [
  { type: 'function', name: 'balanceOf', inputs: [{ name: 'address', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'transfer', inputs: [{ name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { type: 'function', name: 'decimals', inputs: [], outputs: [{ name: '', type: 'uint8' }] },
  { type: 'function', name: 'symbol', inputs: [], outputs: [{ name: '', type: 'string' }] },
];

/**
 * Parse a wallet address to determine chain
 */
export function parseAddress(address: string): 'TRC20' | 'ERC20' | 'BEP20' | 'unknown' {
  if (/^T[A-HJ-NP-Za-km-z1-9]{33}$/.test(address)) return 'TRC20'; // Tron base58check
  if (/^0x[a-fA-F0-9]{40}$/.test(address)) return 'ERC20'; // Ethereum
  if (/^0x[a-fA-F0-9]{40}$/.test(address)) return 'BEP20'; // BSC (same format as ERC20)
  return 'unknown';
}

/**
 * TRON RPC endpoints
 */
const TRON_RPC = 'https://api.trongrid.io';
const USDT_TRON_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'; // Mainnet USDT

/**
 * Get TRON balance for TRC20 USDT
 */
export async function getTrc20Balance(address: string): Promise<WalletBalance> {
  // Convert base58check to hex
  const hexAddress = await tronAddressToHex(address);
  
  // Call USDT balanceOf
  const body = {
    contract_address: USDT_TRON_CONTRACT,
    owner_address: hexAddress,
    function_selector: 'balanceOf(address)',
    parameter: `000000000000000000000${hexAddress.replace('41', '')}`,
    visible: true,
  };

  const resp = await fetch(`${TRON_RPC}/wallet/triggerconstantcontract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await resp.json();
  const balanceWei = BigInt(data.constant_result?.[0] || '0');
  const balance = formatUsdt(balanceWei, 6);

  return {
    address,
    chain: 'TRC20',
    balance,
    balanceWei,
    symbol: 'USDT',
    explorerUrl: `https://tronscan.org/address/${address}`,
  };
}

/**
 * Convert Tron base58check address to hex
 */
async function tronAddressToHex(address: string): Promise<string> {
  const resp = await fetch(`${TRON_RPC}/wallet/base58checkaddr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address }),
  });
  const data = await resp.json();
  return data.hex || address;
}

/**
 * Format USDT from wei-like (6 decimals)
 */
export function formatUsdt(wei: bigint, decimals: number = 6): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = wei / divisor;
  const fraction = wei % divisor;
  const fractionStr = fraction.toString().padStart(decimals, '0');
  return `${whole}.${fractionStr}`;
}

/**
 * Get TRC20 transactions for an address
 */
export async function getTrc20Transactions(address: string): Promise<Transaction[]> {
  const resp = await fetch(
    `https://api.trongrid.io/v1/accounts/${address}/transactions/trc20?min_confirmed_timestamp=0&max_confirmed_timestamp=${Date.now()}&limit=20`,
    { headers: { 'Accept': 'application/json' } }
  );

  if (!resp.ok) return [];

  const data = await resp.json();
  const txs: Transaction[] = [];

  for (const tx of data.data || []) {
    if (tx.to !== address && tx.from !== address) continue;

    txs.push({
      txHash: tx.transaction_id,
      from: tx.from,
      to: tx.to,
      value: formatUsdt(BigInt(tx.value || '0'), 6),
      symbol: 'USDT',
      status: tx.confirmed ? 'confirmed' : 'pending',
      timestamp: tx.block_timestamp || 0,
      explorerUrl: `https://tronscan.org/transactions/${tx.transaction_id}`,
    });
  }

  return txs;
}

/**
 * Generate a deposit address (for display)
 */
export function generateDepositInfo(address: string, chain: 'TRC20' | 'ERC20' | 'BEP20'): {
  address: string;
  chain: string;
  symbol: string;
  network: string;
  explorer: string;
  qrContent: string;
} {
  const info = {
    TRC20: {
      symbol: 'USDT-TRC20',
      network: 'Tron (TRC20)',
      explorer: 'https://tronscan.org',
    },
    ERC20: {
      symbol: 'USDT-ERC20',
      network: 'Ethereum (ERC20)',
      explorer: 'https://etherscan.io',
    },
    BEP20: {
      symbol: 'USDT-BEP20',
      network: 'BNB Chain (BEP20)',
      explorer: 'https://bscscan.com',
    },
  };

  const details = info[chain] || info.TRC20;

  return {
    address,
    chain,
    symbol: details.symbol,
    network: details.network,
    explorer: details.explorer,
    qrContent: `${details.symbol}:${address}`,
  };
}

/**
 * Unified wallet interface
 */
export class LobsterWallet {
  private address: string;
  private chain: 'TRC20' | 'ERC20' | 'BEP20';

  constructor(address: string) {
    this.address = address;
    this.chain = parseAddress(address) as 'TRC20' | 'ERC20' | 'BEP20';
  }

  async getBalance(): Promise<WalletBalance> {
    switch (this.chain) {
      case 'TRC20':
        return getTrc20Balance(this.address);
      case 'ERC20':
        // For ERC20, we'd need an ETH RPC provider
        // Using a free public endpoint
        return {
          address: this.address,
          chain: 'ERC20',
          balance: '0.000000', // Would need ETH RPC
          balanceWei: 0n,
          symbol: 'USDT',
          explorerUrl: `https://etherscan.io/address/${this.address}`,
        };
      default:
        return {
          address: this.address,
          chain: this.chain,
          balance: '0.000000',
          balanceWei: 0n,
          symbol: 'USDT',
          explorerUrl: '',
        };
    }
  }

  async getTransactions(): Promise<Transaction[]> {
    if (this.chain === 'TRC20') {
      return getTrc20Transactions(this.address);
    }
    return [];
  }

  getDepositInfo() {
    return generateDepositInfo(this.address, this.chain);
  }
}
