FROM python:3.11.1-slim

# Set working directory early
WORKDIR /app

# Install system dependencies for SSL/TLS
RUN apt-get update && apt-get install -y --no-install-recommends \
    libssl-dev \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Upgrade pip and install dependencies
COPY requirements.txt . 
RUN pip install --upgrade pip \
    && pip install -r requirements.txt

# Copy application files
COPY . .

# Expose application port
EXPOSE 80

# Use CMD to run the application
CMD ["uvicorn", "main:app", "--host=0.0.0.0", "--port=80", "--reload"]
