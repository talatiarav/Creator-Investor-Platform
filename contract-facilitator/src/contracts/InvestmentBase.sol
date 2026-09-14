// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title InvestmentBase
/// @notice Shared lifecycle for all investment contract templates.
///         Status flow: Draft → Funded → Active → Complete / Refunded
/// @dev Templates inherit this and implement _onAccept() for their specific logic.
abstract contract InvestmentBase {
    enum Status { Draft, Funded, Active, Refunded, Complete }

    IERC20 public immutable usdc;
    address public immutable investor;
    address public immutable investee;
    uint256 public immutable principal;
    uint256 public immutable acceptanceDeadline;

    Status public status;

    event Funded(uint256 amount);
    event Accepted(uint256 timestamp);
    event Refunded(uint256 amount);

    error NotInvestor();
    error NotInvestee();
    error WrongStatus();
    error DeadlineNotPassed();
    error DeadlinePassed();
    error ZeroAddress();
    error ZeroAmount();

    modifier onlyInvestor() { if (msg.sender != investor) revert NotInvestor(); _; }
    modifier onlyInvestee() { if (msg.sender != investee) revert NotInvestee(); _; }
    modifier atStatus(Status expected) { if (status != expected) revert WrongStatus(); _; }

    constructor(
        address _usdc,
        address _investor,
        address _investee,
        uint256 _principal,
        uint256 _acceptanceWindow
    ) {
        if (_usdc == address(0) || _investor == address(0) || _investee == address(0))
            revert ZeroAddress();
        if (_principal == 0) revert ZeroAmount();

        usdc = IERC20(_usdc);
        investor = _investor;
        investee = _investee;
        principal = _principal;
        acceptanceDeadline = block.timestamp + _acceptanceWindow;
        status = Status.Draft;
    }

    /// @notice Investor deposits principal. Requires prior usdc.approve(thisContract, principal).
    function fund() external onlyInvestor atStatus(Status.Draft) {
        status = Status.Funded;
        bool ok = usdc.transferFrom(investor, address(this), principal);
        require(ok, "USDC transfer failed");
        emit Funded(principal);
    }

    /// @notice Investee accepts terms before acceptanceDeadline.
    function accept() external onlyInvestee atStatus(Status.Funded) {
        if (block.timestamp > acceptanceDeadline) revert DeadlinePassed();
        status = Status.Active;
        emit Accepted(block.timestamp);
        _onAccept();
    }

    /// @notice Investor reclaims principal if investee never accepted after deadline.
    function reclaim() external onlyInvestor atStatus(Status.Funded) {
        if (block.timestamp <= acceptanceDeadline) revert DeadlineNotPassed();
        status = Status.Refunded;
        usdc.transfer(investor, principal);
        emit Refunded(principal);
    }

    /// @dev Hook called at acceptance. Override in templates for activation logic.
    function _onAccept() internal virtual {}
}
