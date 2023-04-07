certbot certonly \
	--dns-cloudflare \
	--dns-cloudflare-credentials ~/.secrets/certbot/cloudflare.ini \
	-d renda.studio \
	-d *.renda.studio \
	-d rendajs.org \
	-d *.rendajs.org \
	-d rendajs.dev \
	-d *.rendajs.dev
