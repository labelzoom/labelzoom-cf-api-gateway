export const GET_LATEST_VERSION_SQL = `
SELECT
	pvv.*
FROM
	products_variants_versions pvv
JOIN products_variants pv
ON
	pv.id = pvv.variant_id
JOIN products p
ON
	p.id = pv.product_id
WHERE
	p.name = 'LabelZoom Studio'
	AND p.enabled = 1
	AND pv.enabled = 1
	AND pvv.enabled = 1
ORDER BY
	pvv.major DESC,
	pvv.minor DESC,
	pvv.revision DESC
LIMIT 1;
`;

export const VERIFY_LICENSE_SQL = "SELECT 1 FROM licenses WHERE id = ? AND license_secret = ?;";
