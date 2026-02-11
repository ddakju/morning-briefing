import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { isValidKeyFormat, generateFingerprint, isLicensed } from '../dist/src/license.js';
import { getDefaultConfig } from '../dist/src/config.js';

describe('license', () => {
  it('validates correct key format (UUID)', () => {
    assert.ok(isValidKeyFormat('38b1460a-5104-4067-a91d-77b872934d51'));
    assert.ok(isValidKeyFormat('00000000-0000-0000-0000-000000000000'));
    assert.ok(isValidKeyFormat('AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE'));
  });

  it('rejects invalid key formats', () => {
    assert.ok(!isValidKeyFormat(''));
    assert.ok(!isValidKeyFormat('not-a-uuid'));
    assert.ok(!isValidKeyFormat('MB-ABCD-1234-EFGH-5678'));
    assert.ok(!isValidKeyFormat('38b1460a-5104-4067-a91d'));
    assert.ok(!isValidKeyFormat('38b1460a-5104-4067-a91d-77b872934d51-extra'));
    assert.ok(!isValidKeyFormat('38b1460a_5104_4067_a91d_77b872934d51'));
  });

  it('generates consistent fingerprint', () => {
    const fp1 = generateFingerprint();
    const fp2 = generateFingerprint();
    assert.equal(fp1, fp2);
    assert.equal(fp1.length, 16);
  });

  it('returns false for unlicensed default config', () => {
    const config = getDefaultConfig();
    assert.ok(!isLicensed(config));
  });

  it('returns true for licensed config with matching fingerprint', () => {
    const config = getDefaultConfig();
    config.license = {
      key: '38b1460a-5104-4067-a91d-77b872934d51',
      activatedAt: new Date().toISOString(),
      fingerprint: generateFingerprint(),
    };
    assert.ok(isLicensed(config));
  });

  it('returns false for mismatched fingerprint', () => {
    const config = getDefaultConfig();
    config.license = {
      key: '38b1460a-5104-4067-a91d-77b872934d51',
      activatedAt: new Date().toISOString(),
      fingerprint: 'wrongfingerprint1',
    };
    assert.ok(!isLicensed(config));
  });
});
