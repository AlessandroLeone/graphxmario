FROM php:8.4-apache
RUN a2enmod rewrite headers \
    && sed -ri 's!/var/www/html!/var/www/html/public!g' /etc/apache2/sites-available/*.conf \
    && printf '<Directory /var/www/html/public>\nAllowOverride All\nRequire all granted\n</Directory>\n' > /etc/apache2/conf-available/mario-demo.conf \
    && a2enconf mario-demo \
    && mkdir -p /var/lib/mario-demo \
    && chown www-data:www-data /var/lib/mario-demo
COPY public/ /var/www/html/public/
COPY server/ /var/www/html/server/
COPY server/php.ini /usr/local/etc/php/conf.d/mario-demo.ini
ENV PUBLIC_ORIGIN=https://mario.meralab.it GRAPHXDICO_URL=https://graphxdico.it/ DEMO_DATA_DIR=/var/lib/mario-demo
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD php -r '$r=@file_get_contents("http://127.0.0.1/healthz"); exit($r===false?1:0);'
