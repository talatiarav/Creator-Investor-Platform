// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./InvestmentBase.sol";

/// @title FixedReturnTimeLock — Template 1
/// @notice Investor supplies principal. Investee accepts, starting a lock period.
///         Investee must repay a fixed returnAmount within lockDuration seconds.
///         Investor withdraws once full repayment lands.
///         If lock period passes with no repayment, deal is marked overdue (no
///         automatic penalty in v1 — dispute resolution is out-of-band).
contract FixedReturnTimeLock is InvestmentBase {
    uint256 public immutable returnAmount;   // total USDC investee must repay (6 decimals)
    uint256 public immutable lockDuration;   // seconds from acceptance until due
    uint256 public lockEndTime;              // set on accept(); 0 until then
    uint256 public amountRepaid;             // running total deposited by investee
    bool    public withdrawn;                // true once investor withdraws

    event Repaid(uint256 amount, uint256 totalRepaid);
    event Withdrawn(uint256 amount);

    error AlreadyWithdrawn();
    error NothingToWithdraw();
    error RepaymentExceedsOwed();

    constructor(
        address _usdc,
        address _investor,
        address _investee,
        uint256 _principal,
        uint256 _acceptanceWindow,
        uint256 _returnAmount,
        uint256 _lockDuration
    ) InvestmentBase(_usdc, _investor, _investee, _principal, _acceptanceWindow) {
        if (_returnAmount == 0) revert ZeroAmount();
        returnAmount = _returnAmount;
        lockDuration = _lockDuration;
    }

    /// @dev Starts the repayment clock at acceptance.
    function _onAccept() internal override {
        lockEndTime = block.timestamp + lockDuration;
    }

    /// @notice Investee repays in one or more installments.
    ///         Requires prior usdc.approve(thisContract, amount) by investee.
    function repay(uint256 amount) external onlyInvestee atStatus(Status.Active) {
        if (amount == 0) revert ZeroAmount();
        if (amountRepaid + amount > returnAmount) revert RepaymentExceedsOwed();

        amountRepaid += amount;
        bool ok = usdc.transferFrom(investee, address(this), amount);
        require(ok, "USDC transfer failed");
        emit Repaid(amount, amountRepaid);

        if (amountRepaid == returnAmount) status = Status.Complete;
    }

    /// @notice Investor withdraws once full returnAmount has been repaid.
    function withdraw() external onlyInvestor {
        if (withdrawn) revert AlreadyWithdrawn();
        if (amountRepaid != returnAmount) revert NothingToWithdraw();
        withdrawn = true;
        usdc.transfer(investor, returnAmount);
        emit Withdrawn(returnAmount);
    }

    /// @notice True if lock period has passed with no full repayment.
    function isOverdue() external view returns (bool) {
        if (status != Status.Active) return false;
        if (lockEndTime == 0) return false;
        return block.timestamp > lockEndTime && amountRepaid < returnAmount;
    }

    /// @notice Remaining amount investee still owes.
    function amountOwed() external view returns (uint256) {
        return returnAmount - amountRepaid;
    }
}
