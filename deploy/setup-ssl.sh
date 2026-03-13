#!/usr/bin/env bash
set -e

# SSL Setup Script for Phoung
# This script helps set up HTTPS for your domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

# Load environment variables
load_env() {
    if [ -f .env ]; then
        export $(grep -v '^#' .env | grep -v '^$' | xargs)
        log_info "Loaded environment from .env"
    else
        log_error ".env file not found!"
        exit 1
    fi
}

# Check DNS configuration
check_dns() {
    log_info "Checking DNS for $DOMAIN..."

    local dns_ip=$(dig +short $DOMAIN | head -n1)
    local server_ip=$(cat ansible/inventory.ini | grep ansible_host | cut -d'=' -f2)

    if [ -z "$dns_ip" ]; then
        log_error "DNS record not found for $DOMAIN"
        log_info "Please create an A record:"
        log_info "  Type: A"
        log_info "  Name: $DOMAIN"
        log_info "  Value: $server_ip"
        echo ""
        read -p "Have you updated the DNS? (yes/no): " confirm
        if [ "$confirm" != "yes" ]; then
            log_info "Please update your DNS first, then run this script again."
            exit 1
        fi
        # Check again after user confirms
        sleep 5
        dns_ip=$(dig +short $DOMAIN | head -n1)
    fi

    if [ "$dns_ip" != "$server_ip" ]; then
        log_error "DNS mismatch!"
        log_info "  Current DNS: $dns_ip"
        log_info "  Server IP: $server_ip"
        log_info ""
        log_info "Please update your DNS A record to point to: $server_ip"
        echo ""
        log_info "Common DNS providers:"
        log_info "  • Cloudflare: DNS > Records > Add record"
        log_info "  • Namecheap: Domain List > Manage > Advanced DNS"
        log_info "  • GoDaddy: DNS Management > Add Record"
        log_info "  • AWS: Route53 > Hosted Zones > Create Record Set"
        echo ""
        read -p "Press Enter after updating DNS..."
        sleep 10
        check_dns
        return
    fi

    log_success "DNS correctly configured: $DOMAIN → $dns_ip"
}

# Wait for DNS propagation
wait_for_dns() {
    log_info "Waiting for DNS propagation..."
    local max_attempts=30
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        local dns_ip=$(dig +short $DOMAIN | head -n1)
        local server_ip=$(cat ansible/inventory.ini | grep ansible_host | cut -d'=' -f2)

        if [ "$dns_ip" = "$server_ip" ]; then
            log_success "DNS propagated successfully!"
            return
        fi

        attempt=$((attempt + 1))
        log_info "  Attempt $attempt/$max_attempts: DNS still points to $dns_ip"
        sleep 2
    done

    log_error "DNS did not propagate within expected time"
    log_info "This can take up to 24-48 hours for some domains"
    exit 1
}

# Test HTTP connectivity
test_http() {
    log_info "Testing HTTP connectivity to $DOMAIN..."

    if curl -s -o /dev/null -w "%{http_code}" http://$DOMAIN | grep -q "200\|301\|302"; then
        log_success "HTTP server is responding"
    else
        log_warn "HTTP server might not be accessible yet"
    fi
}

# Install SSL and update nginx
setup_ssl() {
    log_info "Deploying with SSL configuration..."

    # Deploy with updated nginx config
    ./deploy.sh deploy

    log_success "Deployment complete!"
}

# Display next steps
show_next_steps() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    log_success "SSL Setup Complete!"
    echo ""
    log_info "Your Phoung is now available at:"
    echo "  ${GREEN}https://$DOMAIN${NC}"
    echo ""
    log_info "Login credentials:"
    echo "  Username: ${BLUE}$BETA_USER${NC}"
    echo "  Password: ${BLUE}$BETA_PASSWORD${NC}"
    echo ""
    log_info "Features:"
    echo "  ✓ HTTPS with SSL certificate"
    echo "  ✓ HTTP to HTTPS redirect"
    echo "  ✓ Chat with @agent mentions"
    echo "  ✓ Automatic SSL renewal (daily at 3 AM)"
    echo ""
    log_info "SSL Certificate Details:"
    echo "  Path: /etc/letsencrypt/live/$DOMAIN/"
    echo "  Auto-renewal: Enabled (cron job)"
    echo "  Email for expiry: $SSL_EMAIL"
    echo ""
    log_warn "Important:"
    echo "  • SSL certificates expire every 90 days"
    echo "  • Auto-renewal is configured via cron"
    echo "  • Check /var/log/letsencrypt/ for renewal logs"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# Main execution
main() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Phoung SSL Setup"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    load_env
    check_dns
    wait_for_dns
    test_http
    setup_ssl
    show_next_steps
}

main
