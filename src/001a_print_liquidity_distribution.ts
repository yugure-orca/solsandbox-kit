import { consolidateTickArray, DYNAMIC_TICK_ARRAY_DISCRIMINATOR, DynamicTickArray, fetchWhirlpool, FIXED_TICK_ARRAY_DISCRIMINATOR, FixedTickArray, getDynamicTickArrayDecoder, getFixedTickArrayDecoder, TickArray, WHIRLPOOL_PROGRAM_ADDRESS } from "@orca-so/whirlpools-client";
import { Account, Address, address, createSolanaRpc, getAddressEncoder, getBase58Decoder, getBase64Encoder, GetProgramAccountsApi, GetProgramAccountsMemcmpFilter, mainnet, Rpc, VariableSizeDecoder } from "@solana/kit";

const KMNO_USDC_TS1 = address("3ndjN1nJVUKGrJBc1hhVpER6kWTZKHdyDrPyCJyX3CXK");

async function main() {
  // gPA call should be supported by the RPC endpoint
  const rpcUrl = process.env["RPC_URL"];
  const rpc = createSolanaRpc(mainnet(rpcUrl));

  // fetch whirlpool
  const whirlpool = await fetchWhirlpool(rpc, KMNO_USDC_TS1);
  const tickSpacing = whirlpool.data.tickSpacing;

  // fetch both fixed and dynamic tick arrays
  const whirlpoolAddress = KMNO_USDC_TS1;
  const [fixedTickArrays, dynamicTickArrays] = await Promise.all([
    fetchFixedTickArrays(rpc, whirlpoolAddress),
    fetchDynamicTickArrays(rpc, whirlpoolAddress),
  ]);

  console.info(`Found ${fixedTickArrays.length} fixed tick arrays and ${dynamicTickArrays.length} dynamic tick arrays for whirlpool ${whirlpoolAddress}`);

  // consolidate tick array layout
  const tickArrays: Account<TickArray, Address>[] = [];
  fixedTickArrays.forEach((t) => tickArrays.push(consolidateTickArray(t)));
  dynamicTickArrays.forEach((t) => tickArrays.push(consolidateTickArray(t)));

  // sort tick arrays by startTickIndex asc
  tickArrays.sort((a, b) => a.data.startTickIndex - b.data.startTickIndex);

  const liquidityDistribution: { tickIndex: number; liquidity: bigint }[] = [];
  let liquidity = 0n;
  for ( let ta = 0; ta < tickArrays.length; ta++ ) {
    const tickarray = tickArrays[ta].data;

    for ( let i = 0; i < 88; i++ ) {
      const tickIndex = tickarray.startTickIndex + i * tickSpacing;

      // store if and only if liquidityNet is not zero
      if ( tickarray.ticks[i].liquidityNet === 0n ) {
        continue;
      }

      // move right (add liquidityNet)
      liquidity += tickarray.ticks[i].liquidityNet;
      liquidityDistribution.push({ tickIndex, liquidity });
    }
  }

  // print liquidity distribution
  for ( let i = 0; i < liquidityDistribution.length - 1; i++ ) {
    const curr = liquidityDistribution[i];
    const next = liquidityDistribution[i + 1];

    const range = `[${curr.tickIndex.toString().padStart(7, " ")}, ${next.tickIndex.toString().padStart(7, " ")})`;
    const liquidity = curr.liquidity.toString().padStart(20, " ");

    console.info(`${range} => liquidity: ${liquidity}`);
  }
}

main();


async function fetchFixedTickArrays(rpc: Rpc<GetProgramAccountsApi>, whirlpool: Address): Promise<Account<FixedTickArray>[]> {
  const discriminator = getBase58Decoder().decode(
    FIXED_TICK_ARRAY_DISCRIMINATOR,
  );
  const discriminatorFilter: GetProgramAccountsMemcmpFilter = {
    memcmp: {
      offset: 0n,
      bytes: discriminator,
      encoding: "base58",
    },
  };

  const whirlpoolFilter: GetProgramAccountsMemcmpFilter = {
    memcmp: {
      offset: 9956n,
      bytes: getBase58Decoder().decode(getAddressEncoder().encode(whirlpool)),
      encoding: "base58",
    },
  };

  return fetchDecodedProgramAccounts(
    rpc,
    WHIRLPOOL_PROGRAM_ADDRESS,
    [discriminatorFilter, whirlpoolFilter],
    getFixedTickArrayDecoder(),
  );  
}

async function fetchDynamicTickArrays(rpc: Rpc<GetProgramAccountsApi>, whirlpool: Address): Promise<Account<DynamicTickArray>[]> {
  const discriminator = getBase58Decoder().decode(
    DYNAMIC_TICK_ARRAY_DISCRIMINATOR,
  );
  const discriminatorFilter: GetProgramAccountsMemcmpFilter = {
    memcmp: {
      offset: 0n,
      bytes: discriminator,
      encoding: "base58",
    },
  };

  const whirlpoolFilter: GetProgramAccountsMemcmpFilter = {
    memcmp: {
      offset: 12n,
      bytes: getBase58Decoder().decode(getAddressEncoder().encode(whirlpool)),
      encoding: "base58",
    },
  };

  return fetchDecodedProgramAccounts(
    rpc,
    WHIRLPOOL_PROGRAM_ADDRESS,
    [discriminatorFilter, whirlpoolFilter],
    getDynamicTickArrayDecoder(),
  );  
}

async function fetchDecodedProgramAccounts<T extends object>(
  rpc: Rpc<GetProgramAccountsApi>,
  programAddress: Address,
  filters: GetProgramAccountsMemcmpFilter[],
  decoder: VariableSizeDecoder<T>,
): Promise<Account<T>[]> {
  const accountInfos = await rpc
    .getProgramAccounts(programAddress, {
      encoding: "base64",
      filters,
    })
    .send();
  const encoder = getBase64Encoder();
  const datas = accountInfos.map((x) => encoder.encode(x.account.data[0]));
  const decoded = datas.map((x) => decoder.decode(x));
  return decoded.map((data, i) => ({
    ...accountInfos[i].account,
    address: accountInfos[i].pubkey,
    programAddress: programAddress,
    data,
  }));
}

/*

$ npx tsx src/001a_print_liquidity_distribution.ts 
Found 160 fixed tick arrays and 47 dynamic tick arrays for whirlpool 3ndjN1nJVUKGrJBc1hhVpER6kWTZKHdyDrPyCJyX3CXK

[-443636,  -69082) => liquidity:            416944588
[ -69082,  -39123) => liquidity:            637265203
[ -39123,  -33961) => liquidity:        9737184753466
[ -33961,  -32192) => liquidity:        9739813930100
[ -32192,  -30463) => liquidity:        9742214789486
[ -30463,  -30440) => liquidity:        9743646745959
[ -30440,  -30269) => liquidity:        9749879104533
[ -30269,  -30096) => liquidity:        9750165619970
[ -30096,  -30057) => liquidity:        9757229950425
[ -30057,  -29977) => liquidity:        9757453160718
[ -29977,  -29876) => liquidity:        9819607563062
[ -29876,  -29802) => liquidity:        9823714291542
[ -29802,  -29736) => liquidity:        9834305233470
[ -29736,  -29087) => liquidity:        9834650945742
[ -29087,  -29006) => liquidity:        9838672629841
[ -29006,  -28789) => liquidity:        9839271941950
[ -28789,  -28715) => liquidity:        9837508044356
[ -28715,  -28356) => liquidity:        9843002837836
[ -28356,  -28136) => liquidity:        9844598697963
[ -28136,  -27969) => liquidity:        9845142089569
[ -27969,  -27944) => liquidity:        9839841656708
[ -27944,  -27840) => liquidity:        9777687254364
[ -27840,  -27808) => liquidity:        9779504904889
[ -27808,  -27795) => liquidity:        9780007766520
[ -27795,  -27772) => liquidity:        9769416824592
[ -27772,  -27708) => liquidity:        9765395140493
[ -27708,  -27661) => liquidity:        9765395146971
[ -27661,  -27515) => liquidity:        9759162788397
[ -27515,  -27475) => liquidity:        9764199110756
[ -27475,  -27137) => liquidity:        9764306042767
[ -27137,  -26746) => liquidity:        9761676866133
[ -26746,  -26691) => liquidity:        9760081006006
[ -26691,  -26535) => liquidity:        9757680146620
[ -26535,  -26256) => liquidity:        9757456936327
[ -26256,  -26138) => liquidity:        9757457664270
[ -26138,  -26112) => liquidity:        9768159235806
[ -26112,  -26016) => liquidity:        9781647108162
[ -26016,  -25882) => liquidity:        9781360592725
[ -25882,  -25519) => liquidity:        9770659021189
[ -25519,  -25459) => liquidity:        9765622698830
[ -25459,  -25265) => liquidity:        9768919864978
[ -25265,  -25073) => liquidity:        9763425071498
[ -25073,  -25012) => liquidity:        9763424343555
[ -25012,  -24653) => liquidity:        9761606693030
[ -24653,  -24571) => liquidity:        9762294220078
[ -24571,  -24411) => liquidity:        9761948507806
[ -24411,  -24326) => liquidity:        9758651341658
[ -24326,  -23839) => liquidity:        9757219385185
[ -23839,  -23788) => liquidity:        9756531858137
[ -23788,  -23573) => liquidity:        9757323336276
[ -23573,  -23033) => liquidity:        9743835463920
[ -23033,  -23028) => liquidity:        9744180956215
[ -23028,  -23027) => liquidity:        9743637564609
[ -23027,  -22540) => liquidity:        9743134702978
[ -22540,  -20165) => liquidity:        9742535390869
[ -20165,  -18973) => liquidity:        9742535384391
[ -18973,  -18771) => liquidity:        9741884788971
[ -18771,  -13935) => liquidity:        9741539296676
[ -13935,  -13864) => liquidity:        9741432364665
[ -13864,  -11215) => liquidity:        9741291481946
[ -11215,       1) => liquidity:        9737184753466
[      1,    1177) => liquidity:        9736964432851
[   1177,  443636) => liquidity:            416944588

*/