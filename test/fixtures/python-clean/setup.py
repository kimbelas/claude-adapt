"""Setup configuration for python-clean fixture project."""

from setuptools import setup, find_packages

setup(
    name="python-clean",
    version="1.0.0",
    description="A clean Python project fixture for testing analyzers",
    author="Test Author",
    author_email="test@example.com",
    packages=find_packages(where="src"),
    package_dir={"": "src"},
    python_requires=">=3.11",
    install_requires=[
        "flask>=3.0.0",
        "sqlalchemy>=2.0.0",
    ],
    extras_require={
        "dev": [
            "pytest>=8.0.0",
            "mypy>=1.8.0",
            "black>=24.0.0",
        ],
    },
)
