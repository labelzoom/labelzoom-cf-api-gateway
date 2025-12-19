import { describe, it, expect } from 'vitest';
import { GET_LATEST_VERSION_SQL, VERIFY_LICENSE_SQL } from '../../src/worker/constants';

describe('SQL Constants', () => {
  describe('GET_LATEST_VERSION_SQL', () => {
    it('should be a valid SQL query string', () => {
      expect(GET_LATEST_VERSION_SQL).toBeDefined();
      expect(typeof GET_LATEST_VERSION_SQL).toBe('string');
      expect(GET_LATEST_VERSION_SQL).toContain('SELECT');
      expect(GET_LATEST_VERSION_SQL).toContain('products_variants_versions');
    });

    it('should query for LabelZoom Studio product', () => {
      expect(GET_LATEST_VERSION_SQL).toContain('LabelZoom Studio');
    });

    it('should order by version numbers descending', () => {
      expect(GET_LATEST_VERSION_SQL).toContain('ORDER BY');
      expect(GET_LATEST_VERSION_SQL).toContain('DESC');
    });

    it('should limit results to 1', () => {
      expect(GET_LATEST_VERSION_SQL).toContain('LIMIT 1');
    });
  });

  describe('VERIFY_LICENSE_SQL', () => {
    it('should be a valid SQL query string', () => {
      expect(VERIFY_LICENSE_SQL).toBeDefined();
      expect(typeof VERIFY_LICENSE_SQL).toBe('string');
      expect(VERIFY_LICENSE_SQL).toContain('SELECT');
      expect(VERIFY_LICENSE_SQL).toContain('licenses');
    });

    it('should use parameterized query', () => {
      expect(VERIFY_LICENSE_SQL).toContain('?');
    });

    it('should check both id and license_secret', () => {
      expect(VERIFY_LICENSE_SQL).toContain('id');
      expect(VERIFY_LICENSE_SQL).toContain('license_secret');
    });
  });
});

