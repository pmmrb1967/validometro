// SPDX-License-Identifier: AGPL-3.0-or-later

export interface Product {
  ean: string;
  found: boolean;
  name: string | null;
  brand: string | null;
  category: string | null;
}

export class ApiError extends Error {}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

/** Product by barcode (D1 cache, then Open Food Facts). */
export async function fetchProduct(ean: string): Promise<Product> {
  let res: Response;
  try {
    res = await fetch(`/api/products/${encodeURIComponent(ean)}`);
  } catch {
    throw new ApiError('Sem ligação: escreve o nome à mão.');
  }
  if (!res.ok) throw new ApiError(await errorMessage(res, 'Não foi possível consultar o produto.'));
  return (await res.json()) as Product;
}
