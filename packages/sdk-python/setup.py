from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="dca-auth",
    version="1.0.0",
    author="DCA-Auth",
    author_email="support@dca-auth.com",
    description="Official Python SDK for DCA-Auth License Management System",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/yourusername/dca-auth-python-sdk",
    packages=find_packages(where="src"),
    package_dir={"": "src"},
    classifiers=[
        "Development Status :: 5 - Production/Stable",
        "Intended Audience :: Developers",
        "Topic :: Software Development :: Libraries :: Python Modules",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.7",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
    ],
    python_requires=">=3.7",
    install_requires=[
        "requests>=2.28.0",
        "websocket-client>=1.4.0",
        "pydantic>=2.0.0",
        "python-dateutil>=2.8.2",
        "cryptography>=41.0.0",
        "typing-extensions>=4.7.0;python_version<'3.8'",
    ],
    extras_require={
        "dev": [
            "pytest>=7.4.0",
            "pytest-cov>=4.1.0",
            "pytest-asyncio>=0.21.0",
            "black>=23.7.0",
            "mypy>=1.4.0",
            "flake8>=6.0.0",
            "sphinx>=7.0.0",
        ],
        "async": [
            "aiohttp>=3.8.0",
            "aiofiles>=23.0.0",
        ],
    },
    entry_points={
        "console_scripts": [
            "dca-auth=dca_auth.cli:main",
        ],
    },
)