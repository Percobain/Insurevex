// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @notice Minimal interface to Hedera's Asset Tokenization Studio (ATS) Factory, as deployed on Hedera testnet
///         (Factory proxy 0xd1F118A40f3b02883D35909eF2517e7EDd78379d, BLR proxy 0xBA2D5FC2083A0b8f164c50e65d782087fBA18E0a).
///         Structs mirror hashgraph/asset-tokenization-studio packages/ats/contracts (IFactory, IResolverProxy, ICore).
interface IATSFactory {
    struct ResolverProxyConfiguration {
        bytes32 key;
        uint256 version;
    }

    struct Rbac {
        bytes32 role;
        address[] members;
    }

    struct ERC20MetadataInfo {
        string name;
        string symbol;
        string isin;
        uint8 decimals;
    }

    struct SecurityData {
        address resolver;
        uint256 maxSupply;
        ResolverProxyConfiguration resolverProxyConfiguration;
        ERC20MetadataInfo erc20MetadataInfo;
        Rbac[] rbacs;
        address[] externalPauses;
        address[] externalControlLists;
        address[] externalKycLists;
        address compliance;
        address identityRegistry;
        bool arePartitionsProtected;
        bool isMultiPartition;
        bool isControllable;
        bool isWhiteList;
        bool clearingActive;
        bool internalKycActivated;
        bool erc20VotesActivated;
    }

    struct EquityDetailsData {
        bool votingRight;
        bool informationRight;
        bool liquidationRight;
        bool subscriptionRight;
        bool conversionRight;
        bool redemptionRight;
        bool putRight;
        uint8 dividendRight; // 0 NONE, 1 PREFERRED, 2 COMMON
        bytes3 currency;
        uint256 nominalValue;
        uint8 nominalValueDecimals;
    }

    struct EquityData {
        SecurityData security;
        EquityDetailsData equityDetails;
    }

    struct BondDetailsData {
        bytes3 currency;
        uint256 nominalValue;
        uint8 nominalValueDecimals;
        uint256 startingDate;
        uint256 maturityDate;
    }

    struct BondData {
        SecurityData security;
        BondDetailsData bondDetails;
        address[] proceedRecipients;
        bytes[] proceedRecipientsData;
    }

    struct AdditionalSecurityData {
        bool countriesControlListType;
        string listOfCountries;
        string info;
    }

    struct FactoryRegulationData {
        uint8 regulationType; // 0 NONE, 1 REG_S, 2 REG_D
        uint8 regulationSubType; // 0 NONE, 1 REG_D_506_B, 2 REG_D_506_C
        AdditionalSecurityData additionalSecurityData;
    }

    event EquityDeployed(address indexed deployer, address equityAddress, EquityData equityData, FactoryRegulationData regulationData);
    event BondDeployed(address indexed deployer, address bondAddress, BondData bondData, FactoryRegulationData regulationData);

    function deployEquity(EquityData calldata equityData, FactoryRegulationData calldata regulationData) external returns (address);
    function deployBond(BondData calldata bondData, FactoryRegulationData calldata regulationData) external returns (address);
}
